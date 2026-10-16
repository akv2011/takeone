import { copyFile, writeFile } from 'node:fs/promises';
import type { JobCtx, Op } from '../types.js';
import type { RunOp } from '../queue/index.js';
import { wordsAtCaption } from './timeline.js';
import { prepareDelivery } from './delivery.js';

export interface CaptionArchive { videoPath: string; metadataPath: string; sceneOnly?: boolean }
export const canArchiveCaptionLayer = (after: Op[]) => after.every(op => ['speakerReframe', 'watermark', 'music', 'trim', 'clip', 'speed', 'format', 'title', 'zoom'].includes(op.op));
/** Retain creator effects without platform captions/branding; finalization applies entitlement. */
export async function archiveCaptionLayer(input: string, caption: Extract<Op, { op: 'captions' }>, after: Op[], ctx: JobCtx, runOp: RunOp, target: CaptionArchive): Promise<void> {
  ctx.signal?.throwIfAborted();
  if (!canArchiveCaptionLayer(after)) throw Error('Caption archive requires reproducible following operations');
  if (!caption.cues?.length || after.some(op => op.op === 'captions')) throw Error('Caption archive requires one timed layer');
  const cues = wordsAtCaption(caption.cues, after);
  if (cues.some(cue => !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || typeof cue.text !== 'string')) throw Error('Invalid archived caption timing');
  const metadata = JSON.stringify({ version: 1, style: caption.style, cues });
  if (Buffer.byteLength(metadata) > 512 * 1024) throw Error('Caption archive exceeds metadata limit');
  let clean = input;
  for (const op of after) {
    ctx.signal?.throwIfAborted();
    if (op.op === 'watermark' && op.platform === true) continue;
    clean = (await runOp(clean, op, ctx)).outputPath;
  }
  const checked = await prepareDelivery(clean, `${target.videoPath}.normalized.mp4`, { maxBytes: 50 * 1024 * 1024, maxDurationSec: 300 }, ctx.signal);
  await copyFile(checked, target.videoPath);
  ctx.signal?.throwIfAborted();
  await writeFile(target.metadataPath, metadata, { signal: ctx.signal });
}
