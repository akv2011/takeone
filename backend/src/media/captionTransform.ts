import { hookOp } from './hook.js';
import { structuredOps, validateStructuredDuration, type EditTransforms } from './structuredEdit.js';
import { copyFile, writeFile } from 'node:fs/promises';
import { route } from '../router/index.js';
import type { JobCtx, Op } from '../types.js';
import type { RunOp } from '../queue/index.js';
import { ffprobe } from './ffmpeg.js';
import { detectFocusX } from './focus.js';
import { canArchiveCaptionLayer, type CaptionArchive } from './captionArchive.js';
import { parseCaptionArchive, restyleCaptionArchive } from './captionRestyle.js';
import { wordsAtCaption } from './timeline.js';
import { prepareDelivery } from './delivery.js';

export interface CaptionTransformOptions {
  transforms?: EditTransforms;
  speakerReframe?: boolean;
  hookTitle?: string;
  prompt: string; userId: string; aspect: '9:16' | '1:1' | '16:9';
  style?: 'none' | 'clean' | 'meme' | 'karaoke';
  font?: 'sans' | 'serif' | 'mono'; position?: 'auto' | 'top' | 'middle' | 'bottom';
  music?: Omit<Extract<Op, { op: 'music' }>, 'op'>;
}
/** Rebuild the timed layer on an edited clean base; never transcribe flattened captions. */
export async function transformCaptionArchive(input: string, raw: string, target: CaptionArchive, options: CaptionTransformOptions, ctx: JobCtx, runOp: RunOp): Promise<string> {
  ctx.signal?.throwIfAborted();
  const meta = await ffprobe(input, ctx.signal);
  if (!meta.hasVideo) throw Error('Caption source has no video');
  const cues = parseCaptionArchive(raw, meta.durationSec);
  const saved = JSON.parse(raw);
  const style = options.style ?? saved.style;
  if (!['none', 'clean', 'meme', 'karaoke'].includes(style)) throw Error('Invalid caption style');
  if (options.transforms) validateStructuredDuration(options.transforms, meta.durationSec);
  const planned = options.speakerReframe ? { ops: [{ op: 'speakerReframe' as const }] } : options.hookTitle !== undefined ? { ops: [hookOp(options.hookTitle)] } : options.transforms ? { ops: structuredOps(options.transforms) } : await route(options.prompt, { userId: options.userId, platform: 'cli', isPro: ctx.isPro, mode: 'edit', attachmentPath: input });
  let ops: Op[] = planned.ops.filter(op => op.op !== 'captions' && !(op.op === 'watermark' && op.platform === true))
    .map(op => op.op === 'format' ? { ...op, aspect: options.aspect } : op);
  if (!options.transforms && options.music && options.prompt === 'Add selected soundtrack') ops = [];
  if (options.music) ops.push({ op: 'music', ...options.music });
  if (!canArchiveCaptionLayer(ops)) throw Error('This edit cannot preserve an editable MP4 caption layer');
  // Preserve the existing smart-reframe behavior without transcribing speech again.
  const ratios = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9 };
  const format = ops.find(op => op.op === 'format' && op.mode !== 'fit' && op.focusX === undefined);
  if (format?.op === 'format' && meta.width / Math.max(1, meta.height) > ratios[format.aspect] + 0.01) {
    const focusX = await detectFocusX(input, ctx);
    ops = ops.map(op => op === format ? (focusX === null ? { ...format, mode: format.mode ?? 'fit' as const } : { ...format, mode: 'crop' as const, focusX }) : op);
  }
  const mapped = wordsAtCaption(cues, ops);
  let clean = input;
  for (const op of ops) {
    ctx.signal?.throwIfAborted();
    clean = (await runOp(clean, op, ctx)).outputPath;
  }
  const checked = await prepareDelivery(clean, `${target.videoPath}.normalized.mp4`, { maxBytes: 50 * 1024 * 1024, maxDurationSec: 300 }, ctx.signal);
  if (checked !== target.videoPath) await copyFile(checked, target.videoPath);
  const nextRaw = JSON.stringify({ version: 1, style: style === 'none' ? saved.style : style, cues: mapped });
  parseCaptionArchive(nextRaw, (await ffprobe(target.videoPath, ctx.signal)).durationSec);
  await writeFile(target.metadataPath, nextRaw, { signal: ctx.signal });
  ctx.signal?.throwIfAborted();
  if (style === 'none' || !mapped.length) return target.videoPath;
  return restyleCaptionArchive(target.videoPath, nextRaw, style, ctx, runOp, options.position, options.font);
}
