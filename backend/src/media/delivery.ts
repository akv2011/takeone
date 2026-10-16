import { stat } from 'node:fs/promises';
import { ff, ffprobe } from './ffmpeg.js';

export interface DeliveryLimits { maxBytes: number; maxDurationSec: number; requireAudio?: boolean }
function check(meta: Awaited<ReturnType<typeof ffprobe>>, bytes: number, limits: DeliveryLimits) {
  if (!meta.hasVideo || meta.width < 2 || meta.height < 2 || !Number.isFinite(meta.durationSec) || meta.durationSec <= 0) throw new Error('Output has no valid video');
  if (meta.durationSec > limits.maxDurationSec + 0.1) throw new Error('Output exceeds duration limit');
  if (bytes < 1 || bytes > limits.maxBytes) throw new Error('Output exceeds size limit');
  if (limits.requireAudio && !meta.hasAudio) throw new Error('Output is missing required audio');
}

/** Validate the entire encoded output, normalizing only incompatible streams. */
export async function prepareDelivery(input: string, normalizedPath: string, limits: DeliveryLimits, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  let output = input;
  let meta = await ffprobe(input);
  check(meta, (await stat(input)).size, limits);
  if (meta.videoCodec !== 'h264' || meta.pixelFormat !== 'yuv420p' || (meta.hasAudio && meta.audioCodec !== 'aac')) {
    await ff(['-protocol_whitelist', 'file', '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', normalizedPath], signal);
    output = normalizedPath;
    meta = await ffprobe(output);
    check(meta, (await stat(output)).size, limits);
  }
  // Metadata alone can look valid while later packets are truncated or undecodable.
  await ff(['-xerror', '-err_detect', 'explode', '-protocol_whitelist', 'file', '-i', output,
    '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-'], signal);
  signal?.throwIfAborted();
  return output;
}
