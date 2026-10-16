import { expect, it, vi } from 'vitest';
import { parseCaptionArchive } from './captionRestyle.js';
const raw = (patch: object = {}) => JSON.stringify({ version: 1, style: 'clean', cues: [{ start: 0, end: 1, text: 'Preserved words' }], ...patch });
it('reads bounded saved timing without accepting another schema', () => {
 expect(parseCaptionArchive(raw(), 2)).toEqual([{ start: 0, end: 1, text: 'Preserved words' }]);
 for (const patch of [{ version: 2 }, { style: 'script' }, { cues: [{}] }, { cues: [{ start: -1, end: 1, text: 'bad' }] }, { cues: [{ start: 0, end: 99, text: 'bad' }] }, { cues: [{ start: 0, end: 1, text: '' }] }, { cues: [{ start: 1, end: 2, text: 'later' }, { start: 0, end: 1, text: 'earlier' }] }]) expect(() => parseCaptionArchive(raw(patch), 2)).toThrow();
 expect(() => parseCaptionArchive(' '.repeat(512 * 1024 + 1), 2)).toThrow();
});

it('corrects words while preserving timing and validates repeated corrections', async () => {
 const { replaceCaptionTexts } = await import('./captionRestyle.js');
 const corrected = replaceCaptionTexts(raw(), ['Fixed word']);
 expect(parseCaptionArchive(corrected, 2)).toEqual([{ start: 0, end: 1, text: 'Fixed word' }]);
 expect(parseCaptionArchive(replaceCaptionTexts(corrected, ['Second correction']), 2)[0].text).toBe('Second correction');
 for (const texts of [[], ['One', 'Two'], [''], ['x'.repeat(4001)]]) expect(() => replaceCaptionTexts(raw(), texts)).toThrow();
});

it('caption position changes alignment without changing cues or allowing ASS injection', async () => {
 const { toAss } = await import('./captions.js');
 for (const [position, alignment] of [['top', '8'], ['middle', '5'], ['bottom', '2']] as const) {
  const ass = toAss([{ start: 0, end: 1, text: 'Fixed words' }], 'clean', { width: 1080, height: 1920 }, position);
  expect(ass.split('\n').find(line => line.startsWith('Style: Default'))!.split(',')[16]).toBe(alignment);
  expect(ass).toContain('Fixed words');
 }
 expect(() => toAss([], 'clean', undefined, 'bad,alignment' as any)).toThrow('Invalid caption position');
});

it('bundled caption fonts change only the style family and reject arbitrary ASS/font inputs', async () => {
 const { toAss } = await import('./captions.js');
 const cues = [{ start: 0, end: 1, text: 'Original words' }];
 const events = (ass: string) => ass.split('[Events]')[1];
 const original = toAss(cues, 'clean');
 for (const [font, family] of [['sans', 'DejaVu Sans'], ['serif', 'DejaVu Serif'], ['mono', 'DejaVu Sans Mono']] as const) {
  const ass = toAss(cues, 'clean', undefined, undefined, font);
  expect(ass).toContain(`Style: Default,${family},`); expect(events(ass)).toBe(events(original));
 }
 for (const font of ['__proto__', 'constructor', 'Arial,200', '../font.ttf']) expect(() => toAss(cues, 'clean', undefined, undefined, font as any)).toThrow('Invalid caption font');
});

it('archive restyles forward the selected font and cancellation without changing saved timing', async () => {
 const ffmpeg = await import('./ffmpeg.js');
 const probe = vi.spyOn(ffmpeg, 'ffprobe').mockResolvedValue({ hasVideo: true, hasAudio: true, width: 720, height: 1280, durationSec: 2 });
 const { restyleCaptionArchive } = await import('./captionRestyle.js');
 const signal = new AbortController().signal;
 const run = vi.fn(async () => ({ outputPath: '/restyled.mp4' }));
 try {
  expect(await restyleCaptionArchive('/source.mp4', raw(), 'clean', { tmpDir: '/tmp', isPro: true, strictMedia: true, signal }, run, 'top', 'serif')).toBe('/restyled.mp4');
  expect(probe).toHaveBeenCalledWith('/source.mp4', signal);
  expect(run.mock.calls[0][1]).toMatchObject({ font: 'serif', position: 'top', cues: [{ start: 0, end: 1, text: 'Preserved words' }] });
 } finally { probe.mockRestore(); }
});
