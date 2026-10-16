import type { JobCtx } from '../types.js';
import type { RunOp } from '../queue/index.js';
import { ffprobe } from './ffmpeg.js';

export function parseCaptionArchive(raw: string, duration: number) {
  if (Buffer.byteLength(raw) > 512 * 1024 || !Number.isFinite(duration) || duration <= 0 || duration > 300.1) throw Error('Invalid caption archive');
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || !['clean', 'meme', 'karaoke'].includes(data.style) || !Array.isArray(data.cues) || data.cues.length > 10000) throw Error('Invalid caption archive');
  let previous = -1;
  const cues: { start: number; end: number; text: string }[] = data.cues.map((cue: any) => {
    if (!cue || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 4000 || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.start < previous || cue.end <= cue.start || cue.end > duration + 0.1) throw Error('Invalid caption archive');
    previous = cue.start;
    return { start: cue.start, end: cue.end, text: cue.text };
  });
  return cues;
}

export async function restyleCaptionArchive(input: string, raw: string, style: 'none' | 'clean' | 'meme' | 'karaoke', ctx: JobCtx, runOp: RunOp, position?: 'auto' | 'top' | 'middle' | 'bottom', font?: 'sans' | 'serif' | 'mono'): Promise<string> {
  ctx.signal?.throwIfAborted();
  if (!['none', 'clean', 'meme', 'karaoke'].includes(style)) throw Error('Invalid caption style');
  const meta = await ffprobe(input, ctx.signal);
  if (!meta.hasVideo) throw Error('Caption source has no video');
  const cues = parseCaptionArchive(raw, meta.durationSec);
  ctx.signal?.throwIfAborted();
  if (style === 'none') return input;
  if (!cues.length) throw Error('Caption source contains no timed speech');
  return (await runOp(input, { op: 'captions', source: 'script', style, position, font, cues: cues.map(cue => style === 'meme' ? { ...cue, text: cue.text.toUpperCase() } : cue) }, ctx)).outputPath;
}

export function replaceCaptionTexts(raw: string, texts: string[]): string {
  const cues = parseCaptionArchive(raw, 300.1);
  if (!Array.isArray(texts) || texts.length !== cues.length || !texts.length) throw Error('Caption text count must match saved timing');
  const data = JSON.parse(raw);
  const corrected = JSON.stringify({ version: 1, style: data.style, cues: cues.map((cue, i) => ({ ...cue, text: texts[i] })) });
  parseCaptionArchive(corrected, 300.1);
  return corrected;
}
