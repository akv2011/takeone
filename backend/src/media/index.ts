import { detectSpeakerTrack, renderSpeakerTrack } from './speakerTrack.js';
// B1 — media-core. Every Op implemented with real ffmpeg (arg-arrays only, honors ctx.signal).
// Text ops (captions/watermark) use drawtext/subtitles on a full ffmpeg build and degrade to a
// visible bar on builds without libass/freetype so a valid video is always produced.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaCore, Op, JobCtx } from '../types.js';
import { ff, ffprobe, hasFilter, fontFile } from './ffmpeg.js';
import { mixMusic } from './music.js';
import { seconds } from './timeline.js';
import { toAss, titleAss } from './captions.js';
import { fetchStockBroll } from './broll.js';
import { fetchSticker } from './gifs.js';
import { synthesizeNarration } from '../google/tts.js';
import { formatFilter, cutawayGraph, clampSegments, zoomFilter, clampZooms, gifGraph, clampGifs } from './filters.js';

const out = (ctx: JobCtx, op: string, ext = 'mp4') =>
  join(ctx.tmpDir, `${op}-${Math.random().toString(36).slice(2)}.${ext}`);

// file input with an SSRF guard: only the local file protocol is allowed (no http/hls/concat).
const inp = (path: string) => ['-protocol_whitelist', 'file', '-i', path];

const ASPECTS: Record<string, [number, number]> = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] };

export class MediaError extends Error {}

export const mediaCore: MediaCore = {
  async runOp(input: string, op: Op, ctx: JobCtx): Promise<{ outputPath: string }> {
    const sig = ctx.signal;
    // probe the input once so ops can adapt to missing audio/video streams
    const meta = input ? await ffprobe(input).catch(() => null) : null;
    const needsVideo = ['speakerReframe', 'format', 'watermark', 'captions', 'sticker', 'thumbnail', 'cutaways', 'title', 'gifs', 'zoom'].includes(op.op);
    if (meta && needsVideo && !meta.hasVideo) throw new MediaError('this file has no video to edit');
    switch (op.op) {
      case 'music': {
        const outputPath = out(ctx, 'music');
        await mixMusic(input, outputPath, op, sig);
        return { outputPath };
      }
      case 'trim':
      case 'clip': {
        const o = out(ctx, op.op);
        const start = seconds(op.start), end = seconds(op.end);
        if (end <= start) throw new MediaError('Trim end must follow start');
        await ff([...inp(input), '-ss', String(start), '-t', String(end - start), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', o], sig);
        return { outputPath: o };
      }
      case 'format': {
        const [w, h] = ASPECTS[op.aspect] ?? ASPECTS['9:16'];
        const o = out(ctx, 'format');
        const aCopy = meta?.hasAudio ? ['-c:a', 'copy'] : ['-an'];
        const blur = (await hasFilter('gblur')) ? 'gblur=sigma=8' : 'boxblur=8:2';
        await ff([...inp(input), '-vf',
          formatFilter(w, h, op.mode ?? 'crop', op.focusX, blur), ...aCopy, o], sig);
        return { outputPath: o };
      }
      case 'cutaways': {
        // b-roll cutaways over the A-roll: fetch stock footage per window, overlay it while the
        // original audio keeps playing. Production requires footage for each usable
        // requested window; explicit offline mode can skip missing assets.
        const [w, h] = [meta?.width || 1080, meta?.height || 1920];
        const segments = clampSegments(op.segments, meta?.durationSec ?? 0);
        const clips = await Promise.all(segments.map(async (s) => ({
          seg: s, path: await fetchStockBroll(s.keywords, sig),
        })));
        const usable = clips.filter((c): c is { seg: typeof c.seg; path: string } => !!c.path);
        if (ctx.strictMedia && (!usable.length || usable.length !== segments.length)) throw new MediaError('Stock footage unavailable for requested cutaways');
        const o = out(ctx, 'cutaways');
        if (!usable.length) { await ff([...inp(input), '-c', 'copy', o], sig); return { outputPath: o }; }
        const graph = cutawayGraph(usable.map((c) => c.seg), w, h);
        const brollInputs = usable.flatMap((c) => ['-i', c.path]);
        const aMap = meta?.hasAudio ? ['-map', '0:a', '-c:a', 'copy'] : ['-an'];
        await ff([...inp(input), ...brollInputs, '-filter_complex', graph,
          '-map', '[vout]', ...aMap, o], sig);
        return { outputPath: o };
      }
      case 'speed': {
        if (!Number.isFinite(op.factor) || op.factor < 0.5 || op.factor > 3) throw new MediaError('Speed must be between 0.5x and 3x');
        const o = out(ctx, 'speed');
        const v = (1 / op.factor).toFixed(4);
        if (meta?.hasAudio) {
          await ff([...inp(input), '-filter_complex',
            `[0:v]setpts=${v}*PTS[v];[0:a]${tempoFilters(op.factor)}[a]`,
            '-map', '[v]', '-map', '[a]', o], sig);
        } else {
          await ff([...inp(input), '-filter:v', `setpts=${v}*PTS`, '-an', o], sig);
        }
        return { outputPath: o };
      }
      case 'convert': {
        if (op.to === 'mp3') {
          if (meta && !meta.hasAudio) throw new MediaError('this file has no audio track to extract');
          const o = out(ctx, 'convert', 'mp3'); await ff([...inp(input), '-vn', '-q:a', '2', o], sig); return { outputPath: o };
        }
        if (op.to === 'gif') {
          const o = out(ctx, 'convert', 'gif');
          await ff([...inp(input), '-vf', 'fps=12,scale=480:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', o], sig);
          return { outputPath: o };
        }
        if (op.to === 'webm') { const o = out(ctx, 'convert', 'webm'); await ff([...inp(input), '-c:v', 'libvpx-vp9', '-c:a', 'libopus', o], sig); return { outputPath: o }; }
        // even-dimension scale guards against libx264 rejecting odd source dims
        const o = out(ctx, 'convert'); await ff([...inp(input), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', o], sig); return { outputPath: o };
      }
      case 'watermark': {
        const o = out(ctx, 'watermark');
        const aCopy = meta?.hasAudio ? ['-c:a', 'copy'] : ['-an'];
        if (!op.show) { await ff([...inp(input), '-c', 'copy', o], sig); return { outputPath: o }; }
        if (await hasFilter('drawtext')) {
          const pos = wmPos(op.position);
          await ff([...inp(input), '-vf',
            `drawtext=fontfile=${fontFile()}:text='${op.text.replace(/[':\\]/g, '')}':fontcolor=white@0.85:fontsize=28:${pos}`,
            ...aCopy, o], sig);
        } else {
          await ff([...inp(input), '-vf', 'drawbox=x=0:y=ih-46:w=iw:h=46:color=black@0.45:t=fill', ...aCopy, o], sig);
        }
        return { outputPath: o };
      }
      case 'captions': {
        const o = out(ctx, 'captions');
        const aCopy = meta?.hasAudio ? ['-c:a', 'copy'] : ['-an'];
        const canBurn = await hasFilter('subtitles');
        if (canBurn && (op.cues?.length || op.text)) {
          const ass = join(ctx.tmpDir, `cap-${Math.random().toString(36).slice(2)}.ass`);
          const cues = op.cues?.length ? op.cues : [{ start: 0, end: 5, text: op.text! }];
          await writeFile(ass, toAss(cues, op.style, { width: meta?.width || 1080, height: meta?.height || 1920 }, op.position, op.font, op.colors));
          await ff([...inp(input), '-vf', `subtitles=${ass}`, ...aCopy, o], sig);
        } else {
          if (ctx.strictMedia) throw new MediaError('Captions require timed text and subtitle rendering support');
          // limited build: caption bar placeholder so the pipeline still yields valid video
          await ff([...inp(input), '-vf', 'drawbox=x=0:y=ih-140:w=iw:h=140:color=black@0.35:t=fill', ...aCopy, o], sig);
        }
        return { outputPath: o };
      }
      case 'speakerReframe': {
        const points = await detectSpeakerTrack(input, ctx);
        return { outputPath: await renderSpeakerTrack(input, out(ctx, 'speaker'), points, ctx) };
      }
      case 'title': {
        // hook card: big pop-in line at the top for the first seconds (ASS on full builds,
        // drawtext on builds without libass, passthrough on neither)
        const o = out(ctx, 'title');
        const aCopy = meta?.hasAudio ? ['-c:a', 'copy'] : ['-an'];
        const dur = Math.min(op.durationSec ?? 3, Math.max(1.5, (meta?.durationSec ?? 3) * 0.25));
        if (!op.text.trim()) { await ff([...inp(input), '-c', 'copy', o], sig); return { outputPath: o }; }
        if (await hasFilter('subtitles')) {
          const ass = join(ctx.tmpDir, `title-${Math.random().toString(36).slice(2)}.ass`);
          await writeFile(ass, titleAss(op.text, dur, { width: meta?.width || 1080, height: meta?.height || 1920 }));
          await ff([...inp(input), '-vf', `subtitles=${ass}`, ...aCopy, o], sig);
        } else if (ctx.strictMedia) {
          throw new MediaError('Opening titles require subtitle rendering support');
        } else if (await hasFilter('drawtext')) {
          await ff([...inp(input), '-vf',
            `drawtext=fontfile=${fontFile()}:text='${op.text.replace(/[':\\]/g, '')}':fontcolor=yellow:fontsize=64:` +
            `x=(w-tw)/2:y=140:borderw=4:bordercolor=black:enable='lt(t,${dur.toFixed(2)})'`, ...aCopy, o], sig);
        } else {
          await ff([...inp(input), '-c', 'copy', o], sig);
        }
        return { outputPath: o };
      }
      case 'zoom': {
        // punch-in emphasis: 1.08x jump-cut zoom during each window
        const o = out(ctx, 'zoom');
        const aCopy = meta?.hasAudio ? ['-c:a', 'copy'] : ['-an'];
        const windows = clampZooms(op.windows, meta?.durationSec ?? 0);
        if (!windows.length) { await ff([...inp(input), '-c', 'copy', o], sig); return { outputPath: o }; }
        await ff([...inp(input), '-vf',
          zoomFilter(windows, meta?.width || 1080, meta?.height || 1920), ...aCopy, o], sig);
        return { outputPath: o };
      }
      case 'gifs': {
        // Production requires requested stickers; explicit offline mode can skip missing assets.
        const items = clampGifs(op.items, meta?.durationSec ?? 0);
        const fetched = await Promise.all(items.map(async (g) => ({ g, path: await fetchSticker(g.query, sig) })));
        const usable = fetched.filter((f): f is { g: typeof f.g; path: string } => !!f.path);
        if (ctx.strictMedia && (!usable.length || usable.length !== items.length)) throw new MediaError('Sticker footage unavailable for requested overlays');
        const o = out(ctx, 'gifs');
        if (!usable.length) { await ff([...inp(input), '-c', 'copy', o], sig); return { outputPath: o }; }
        const gifInputs = usable.flatMap((f) => ['-ignore_loop', '0', '-i', f.path]);
        const aMap = meta?.hasAudio ? ['-map', '0:a', '-c:a', 'copy'] : ['-an'];
        await ff([...inp(input), ...gifInputs, '-filter_complex',
          gifGraph(usable.map((f) => f.g), meta?.width || 1080, meta?.height || 1920),
          '-map', '[vout]', ...aMap, o], sig);
        return { outputPath: o };
      }
      case 'sticker': {
        const o = out(ctx, 'sticker', 'gif');
        await ff([...inp(input), '-t', '3', '-vf', 'fps=12,scale=320:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', o], sig);
        return { outputPath: o };
      }
      case 'thumbnail': {
        const o = out(ctx, 'thumb', 'png');
        await ff(['-ss', op.at, ...inp(input), '-frames:v', '1', o], sig);
        return { outputPath: o };
      }
      case 'voiceover': {
        // Google Text-to-Speech. Only offline mode falls back to the local system voice.
        const o = out(ctx, 'voice', 'm4a');
        const raw = join(ctx.tmpDir, `tts-${Math.random().toString(36).slice(2)}`);
        let parts: string[];
        try {
          parts = await synthesizeNarration(op.script, raw, sig, ctx.captionLanguage);
        } catch (error) {
          sig?.throwIfAborted();
          if (ctx.strictMedia) throw new MediaError('Voice provider failed; narration was not generated', { cause: error });
          await sayTTS(op.script, `${raw}.aiff`);
          parts = [`${raw}.aiff`];
        }
        // A long script comes back as several synthesize calls, joined here in speaking order.
        const concat = parts.length > 1 ? ['-filter_complex', `${parts.map((_, i) => `[${i}:a]`).join('')}concat=n=${parts.length}:v=0:a=1`] : [];
        await ff([...parts.flatMap(part => ['-i', part]), ...concat, '-c:a', 'aac', o], sig);
        return { outputPath: o };
      }
      case 'broll': {
        // real stock footage (Pexels -> Pixabay, cached) normalized to the vertical canvas;
        // degrades to the kinetic gradient when no provider delivers (offline / no keys).
        const o = out(ctx, 'broll');
        const dur = Math.min(30, Math.max(2, op.durationSec ?? 8));
        const stock = await fetchStockBroll(op.keywords, sig);
        if (stock) {
          await ff(['-stream_loop', '-1', '-t', String(dur), '-i', stock, '-vf',
            'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
            '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', o], sig);
          return { outputPath: o };
        }
        if (ctx.strictMedia) throw new MediaError('Stock footage provider did not return a usable clip');
        await ff(['-f', 'lavfi', '-i', `gradients=s=1080x1920:c0=0x1b1030:c1=0x7c5cff:duration=${dur}:speed=0.03`,
          '-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', o], sig).catch(async () => {
          await ff(['-f', 'lavfi', '-i', `color=c=0x1b1030:s=1080x1920:d=${dur}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', o], sig);
        });
        return { outputPath: o };
      }
    }
  },
};

function tempoFilters(factor: number): string { return factor > 2 ? `atempo=2,atempo=${factor / 2}` : `atempo=${factor}`; }
function wmPos(p?: string): string {
  switch (p) {
    case 'tl': return 'x=20:y=20'; case 'tr': return 'x=w-tw-20:y=20';
    case 'bl': return 'x=20:y=h-th-20'; default: return 'x=w-tw-20:y=h-th-20';
  }
}
function sayTTS(text: string, aiff: string): Promise<void> {
  // macOS `say`; on Linux espeak-ng (writes wav — ffmpeg probes by content, not extension)
  return new Promise((res, rej) => {
    const p = process.platform === 'darwin'
      ? spawn('say', ['-o', aiff, text.slice(0, 500)], { timeout: 45_000, killSignal: 'SIGKILL' })
      : spawn('espeak-ng', ['-w', aiff, text.slice(0, 500)], { timeout: 45_000, killSignal: 'SIGKILL' });
    p.on('error', rej); p.on('close', (c) => (c === 0 ? res() : rej(new Error(`tts exit ${c}`))));
  });
}
export { ffprobe };
