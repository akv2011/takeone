import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { boundedDownload } from '../managed/files.js';
import { fetchStockBroll, MAX_STOCK_BYTES } from './broll.js';
import { ff, ffprobe } from './ffmpeg.js';
import { validateScenePlan, type ScenePlan } from '../content/scenes.js';
import type { JobCtx } from '../types.js';

// Resolve the complete cut before encoding. A failed scene must not become a loop
// of a different scene or an offline placeholder in a production export.
export async function renderStockScenes(plan: ScenePlan, durationSec: number, ctx: JobCtx, aspect: '9:16' | '1:1' | '16:9' = '9:16'): Promise<string> {
  const validated = validateScenePlan(plan, durationSec);
  const frameDuration = (start: number, end: number) => (Math.ceil(end * 30) - Math.ceil(start * 30)) / 30;
  const sources: string[] = [];
  const fingerprints = new Set<string>();
  for (const scene of validated.scenes) {
    ctx.signal?.throwIfAborted();
    const source = await fetchStockBroll(scene.searchTerms, ctx.signal);
    if (!source) throw Error('Stock scene has no usable footage');
    // Freeze this attempt's selection before probing/hashing; concurrent cache
    // refreshes must not change the bytes used later by the encoder.
    const snapshot = join(ctx.tmpDir, `scene-source-${sources.length}.mp4`);
    await boundedDownload(createReadStream(source, { signal: ctx.signal }), snapshot, MAX_STOCK_BYTES, ctx.signal ?? AbortSignal.timeout(60_000));
    const meta = await ffprobe(snapshot, ctx.signal);
    if (!meta.hasVideo || !Number.isFinite(meta.durationSec) || meta.durationSec < frameDuration(scene.startSec, scene.endSec)) {
      throw Error('Stock scene footage is shorter than the planned shot');
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(snapshot, { signal: ctx.signal })) hash.update(chunk);
    const fingerprint = hash.digest('hex');
    if (fingerprints.has(fingerprint)) throw Error('Stock scenes resolved to repeated footage');
    fingerprints.add(fingerprint);
    sources.push(snapshot);
  }
  const dimensions = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] }[aspect];
  if (!dimensions) throw Error('Invalid scene output aspect');
  const [width, height] = dimensions;
  const rendered: string[] = [];
  for (const [index, scene] of validated.scenes.entries()) {
    ctx.signal?.throwIfAborted();
    const path = join(ctx.tmpDir, `scene-${index}.mp4`);
    await ff(['-i', sources[index], '-t', String(frameDuration(scene.startSec, scene.endSec)), '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30`,
      '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path], ctx.signal);
    // Container duration may include an audio tail longer than the video.
    // This output has no audio, so its duration proves the shot has enough frames.
    const encoded = await ffprobe(path, ctx.signal);
    if (!encoded.hasVideo || !Number.isFinite(encoded.durationSec) ||
      Math.abs(encoded.durationSec - frameDuration(scene.startSec, scene.endSec)) > 1 / 60) {
      throw Error('Encoded stock scene does not cover the planned shot');
    }
    rendered.push(path);
  }
  const output = join(ctx.tmpDir, 'planned-scenes.mp4');
  const manifest = join(ctx.tmpDir, 'scenes.concat');
  await writeFile(manifest, rendered.map((_, index) => `file 'scene-${index}.mp4'`).join('\n'), { signal: ctx.signal });
  await ff(['-f', 'concat', '-safe', '1', '-i', manifest, '-an', '-c', 'copy', output], ctx.signal);
  return output;
}
