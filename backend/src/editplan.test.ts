// Phase-1 edit-plan logic: LLM moment parsing, plan -> ops folding, reframe filter builders,
// b-roll provider parsing. All pure — no network, no ffmpeg.
import { describe, it, expect } from 'vitest';
import { toMoment } from './moments.js';
import { applyEditPlan } from './gateway/index.js';
import { route } from './router/index.js';
import { formatFilter, clampSegments, cutawayGraph, zoomFilter, clampZooms, gifGraph, clampGifs } from './media/filters.js';
import { parsePexels, parsePixabay, brollCacheKey } from './media/broll.js';
import { canArchiveCaptionLayer } from './media/captionArchive.js';
import { parseGiphy } from './media/gifs.js';
import { parseFocus } from './media/focus.js';
import { toAss, titleAss } from './media/captions.js';
import type { JobSpec } from './types.js';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

describe('moments -> edit plan (toMoment)', () => {
  it('parses reframe + broll, converting absolute times to clip offsets', () => {
    const m = toMoment({
      start_sec: 100, end_sec: 125, hook: 'wild take', reframe: 'crop',
      broll: [{ at_sec: 105, dur_sec: 3, keywords: ['stock market', 'crash'] }],
    }, mmss)!;
    expect(m.start).toBe('1:40'); expect(m.end).toBe('2:05');
    expect(m.reframe).toBe('crop');
    expect(m.broll).toEqual([{ at: 5, dur: 3, keywords: ['stock market', 'crash'] }]);
  });

  it('clamps to 30s, drops invalid/out-of-window broll and junk reframe', () => {
    const m = toMoment({
      start_sec: 10, end_sec: 90, reframe: 'zoom',
      broll: [{ at_sec: 5, dur_sec: 3, keywords: ['x'] },          // before start
              { at_sec: 70, dur_sec: 3, keywords: ['x'] },          // after clamped end
              { at_sec: 20, dur_sec: 3, keywords: [] }],            // no keywords
    }, mmss)!;
    expect(m.end).toBe('0:40');
    expect(m.reframe).toBeUndefined();
    expect(m.broll).toBeUndefined();
  });

  it('rejects a broken moment', () => {
    expect(toMoment({ start_sec: 50, end_sec: 40 }, mmss)).toBeNull();
  });
});

describe('applyEditPlan', () => {
  const job = (): JobSpec => ({
    id: 'x', userId: 'u', platform: 'telegram', mode: 'clip', isPro: false,
    source: { kind: 'youtube', url: 'https://youtu.be/abc' },
    ops: [{ op: 'format', aspect: '9:16' }, { op: 'captions', source: 'whisper', style: 'karaoke' }],
    limits: { maxBytes: 1, maxDurationSec: 1, timeoutSec: 1 },
  });

  it('sets reframe mode and inserts cutaways after format, before captions', () => {
    const out = applyEditPlan(job(), { reframe: 'fit', broll: [{ at: 5, dur: 3, keywords: ['cats'] }] });
    const captionIndex = out.ops.findIndex(o => o.op === 'captions');
    expect(canArchiveCaptionLayer(out.ops.slice(captionIndex + 1))).toBe(true);
    expect(out.ops.map((o) => o.op)).toEqual(['format', 'cutaways', 'captions']);
    expect(out.ops[0]).toMatchObject({ op: 'format', mode: 'fit' });
  });

  it('explicit user mode wins over the plan', () => {
    const j = job(); (j.ops[0] as any).mode = 'crop';
    const out = applyEditPlan(j, { reframe: 'fit' });
    expect(out.ops[0]).toMatchObject({ mode: 'crop' });
  });
});

describe('router reframe keywords', () => {
  const ctx = { userId: 'u', platform: 'telegram' as const, isPro: false };
  it('"blur" -> fit mode', async () => {
    const j = await route('clip https://youtu.be/abc123xyz 2:30 to 3:15 with blur background', ctx);
    expect(j.ops.find((o) => o.op === 'format')).toMatchObject({ mode: 'fit' });
  });
  it('no keyword -> mode left for prepare() to decide', async () => {
    const j = await route('clip https://youtu.be/abc123xyz 2:30 to 3:15', ctx);
    expect((j.ops.find((o) => o.op === 'format') as any).mode).toBeUndefined();
  });
});

describe('filter builders', () => {
  it('crop centered by default', () => {
    expect(formatFilter(1080, 1920)).toBe('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
  });
  it('crop pans onto focusX', () => {
    const f = formatFilter(1080, 1920, 'crop', 0.7);
    expect(f).toContain("crop=1080:1920:'min(max(iw*0.7000-ow/2,0),iw-ow)':'(ih-oh)/2'");
  });
  it('near-center focus stays a plain center crop', () => {
    expect(formatFilter(1080, 1920, 'crop', 0.51)).not.toContain('min(max');
  });
  it('fit builds blur-pad graph', () => {
    const f = formatFilter(1080, 1920, 'fit');
    expect(f).toContain('gblur'); expect(f).toContain('overlay=(W-w)/2:(H-h)/2');
  });
  it('clampSegments enforces bounds, spacing, and the 2-cutaway cap', () => {
    const s = clampSegments([
      { at: 0, dur: 10, keywords: ['a'] },      // clamped to 1.5s start, 4s max
      { at: 6.2, dur: 2, keywords: ['b'] },     // overlaps first + gap -> dropped
      { at: 9, dur: 2, keywords: ['c'] },
      { at: 13, dur: 2, keywords: ['d'] },      // over the 2-cap
      { at: 25, dur: 3, keywords: ['e'] },      // too close to end
    ], 28);
    expect(s).toEqual([{ at: 1.5, dur: 4, keywords: ['a'] }, { at: 9, dur: 2, keywords: ['c'] }]);
  });
  it('cutawayGraph chains overlays and ends at [vout]', () => {
    const g = cutawayGraph([{ at: 2, dur: 3, keywords: ['x'] }, { at: 8, dur: 2, keywords: ['y'] }], 1080, 1920);
    expect(g).toContain("[0:v][b0]overlay=eof_action=pass:enable='between(t,2.000,5.000)'[v0]");
    expect(g).toContain("[v0][b1]overlay=eof_action=pass:enable='between(t,8.000,10.000)'[vout]");
  });
});

describe('b-roll provider parsing', () => {
  it('pexels: prefers portrait mp4', () => {
    const url = parsePexels({ videos: [{ video_files: [
      { file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://x/land.mp4' },
      { file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://x/port.mp4' },
    ] }] });
    expect(url).toBe('https://x/port.mp4');
  });
  it('pixabay: takes the largest rendition available', () => {
    expect(parsePixabay({ hits: [{ videos: { medium: { url: 'https://x/m.mp4' } } }] })).toBe('https://x/m.mp4');
    expect(parsePixabay({ hits: [] })).toBeNull();
  });
  it('cache key is order/case-insensitive', () => {
    expect(brollCacheKey(['Stock Market', 'crash'])).toBe(brollCacheKey(['crash', 'stock market']));
  });
});

describe('phase 2: viral polish', () => {
  it('toMoment parses gifs + zooms relative to the moment start', () => {
    const m = toMoment({
      start_sec: 100, end_sec: 125,
      gifs: [{ at_sec: 110, dur_sec: 3, query: 'mind blown' }],
      zooms: [{ at_sec: 105, dur_sec: 2 }, { at_sec: 118, dur_sec: 1.5 }],
    }, mmss)!;
    expect(m.gifs).toEqual([{ at: 10, dur: 3, query: 'mind blown' }]);
    expect(m.zooms).toEqual([{ at: 5, dur: 2 }, { at: 18, dur: 1.5 }]);
  });

  it('applyEditPlan orders: format, zoom, cutaways, title ... gifs, captions', () => {
    const job: JobSpec = {
      id: 'x', userId: 'u', platform: 'telegram', mode: 'clip', isPro: false,
      source: { kind: 'youtube', url: 'https://youtu.be/abc' },
      ops: [{ op: 'format', aspect: '9:16' }, { op: 'captions', source: 'whisper', style: 'karaoke' },
            { op: 'watermark', text: 'x', show: true }],
      limits: { maxBytes: 1, maxDurationSec: 1, timeoutSec: 1 },
    };
    const out = applyEditPlan(job, {
      reframe: 'crop', hook: 'Fired From His Own Company',
      broll: [{ at: 5, dur: 3, keywords: ['x'] }],
      gifs: [{ at: 10, dur: 3, query: 'shocked' }], zooms: [{ at: 4, dur: 2 }],
    });
    const captionIndex = out.ops.findIndex(o => o.op === 'captions');
    expect(canArchiveCaptionLayer(out.ops.slice(captionIndex + 1))).toBe(true);
    expect(out.ops.map((o) => o.op)).toEqual(
      ['format', 'zoom', 'cutaways', 'title', 'gifs', 'captions', 'watermark']);
  });

  it('animated captions: pop transform on karaoke, none on clean', () => {
    const cues = [{ start: 0, end: 1, text: 'hello' }];
    expect(toAss(cues, 'karaoke')).toContain('\\t(0,110,\\fscx112');
    expect(toAss(cues, 'clean')).not.toContain('\\t(');
  });

  it('titleAss: uppercased hook with fade, sane duration', () => {
    const ass = titleAss('why he got fired', 3);
    expect(ass).toContain('WHY HE GOT FIRED');
    expect(ass).toContain('\\fad(150,250)');
    expect(ass).toContain('0:00:03');
  });

  it('zoomFilter builds a windowed zoompan; clampZooms bounds windows', () => {
    expect(zoomFilter([{ at: 2, dur: 2 }], 1080, 1920))
      .toBe("zoompan=z='if(between(in_time,2.000,4.000),1.08,1)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=1080x1920:fps=30");
    expect(clampZooms([{ at: 0, dur: 9 }, { at: 2, dur: 1 }, { at: 8, dur: 1 }, { at: 12, dur: 1 }], 14))
      .toEqual([{ at: 0.5, dur: 3 }, { at: 8, dur: 1 }]);
  });

  it('gifGraph overlays with shortest=1 + window enable; clampGifs keeps max 1', () => {
    const g = gifGraph([{ at: 3, dur: 3, query: 'wow' }], 1080, 1920);
    expect(g).toContain("overlay=x=W-w-W*0.045:y=H*0.19:shortest=1:enable='between(t,3.000,6.000)'[vout]");
    expect(clampGifs([{ at: 3, dur: 9, query: ' wow ' }, { at: 8, dur: 2, query: 'lol' }], 20))
      .toEqual([{ at: 3, dur: 4, query: 'wow', pos: undefined }]);
  });

  it('parseGiphy picks the first sticker url', () => {
    expect(parseGiphy({ data: [{ images: { fixed_height: { url: 'https://g/x.gif' } } }] })).toBe('https://g/x.gif');
    expect(parseGiphy({ data: [] })).toBeNull();
  });
});

describe('focus parsing', () => {
  it('accepts a valid focus_x and clamps range', () => {
    expect(parseFocus('{"focus_x": 0.72}')).toBe(0.72);
    expect(parseFocus('{"focus_x": 1.4}')).toBe(1);
  });
  it('rejects null / junk / non-JSON', () => {
    expect(parseFocus('{"focus_x": null}')).toBeNull();
    expect(parseFocus('not json')).toBeNull();
    expect(parseFocus(null)).toBeNull();
  });
});
