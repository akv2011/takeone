import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { archiveCaptionLayer, canArchiveCaptionLayer } from './captionArchive.js';
import { mediaCore } from './index.js';
import { ff, ffprobe } from './ffmpeg.js';

it('does not replay provider-selected overlays into a supposedly matching clean export', () => {
 expect(canArchiveCaptionLayer([{ op: 'gifs', items: [] }])).toBe(false);
 expect(canArchiveCaptionLayer([{ op: 'watermark', text: 'brand', show: true }, { op: 'speed', factor: 2 }])).toBe(true);
});

it('retains real caption-free media and maps stored timing through later speed edits', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'caption-archive-test-'));
 try {
  const input = join(dir, 'source.mp4');
  await ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=30', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', input]);
  const target = { videoPath: join(dir, 'clean.mp4'), metadataPath: join(dir, 'captions.json') };
  await archiveCaptionLayer(input, { op: 'captions', source: 'script', style: 'clean', cues: [{ start: 0.2, end: 1.8, text: 'Caption fixture' }] }, [{ op: 'speed', factor: 2 }], { tmpDir: dir, isPro: true, strictMedia: true }, mediaCore.runOp, target);
  // The existing CFR speed operation can retain two boundary frames at 30 fps.
  expect(Math.abs((await ffprobe(target.videoPath)).durationSec - 1)).toBeLessThanOrEqual(2 / 30 + 0.001);
  expect(JSON.parse(await readFile(target.metadataPath, 'utf8'))).toEqual({ version: 1, style: 'clean', cues: [{ start: 0.1, end: 0.9, text: 'Caption fixture' }] });
  const signal = AbortSignal.abort();
  await expect(archiveCaptionLayer(input, { op: 'captions', source: 'script', style: 'clean', cues: [] }, [], { tmpDir: dir, isPro: true, signal }, mediaCore.runOp, target)).rejects.toThrow();
 } finally { await rm(dir, { recursive: true, force: true }); }
});

it('new clean archives omit only explicit platform branding and preserve creator watermarks', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'caption-branding-test-'));
 try {
  const input = join(dir, 'source.mp4');
  await ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=10', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', input]);
  const target = { videoPath: join(dir, 'clean.mp4'), metadataPath: join(dir, 'captions.json') };
  const seen: unknown[] = [];
  const run: typeof mediaCore.runOp = async (input, op, ctx) => { seen.push(op); return mediaCore.runOp(input, op, ctx); };
  const creatorMark = { op: 'watermark' as const, text: 'made with takeone', show: true };
  await archiveCaptionLayer(input, { op: 'captions', source: 'script', style: 'clean', cues: [{ start: 0, end: 1, text: 'Words' }] },
    [{ ...creatorMark, platform: true }, creatorMark], { tmpDir: dir, isPro: false, strictMedia: true }, run, target);
  expect(seen).toEqual([creatorMark]);
  expect((await ffprobe(target.videoPath)).hasVideo).toBe(true);
 } finally { await rm(dir, { recursive: true, force: true }); }
});
