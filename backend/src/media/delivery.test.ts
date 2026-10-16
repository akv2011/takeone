import { test, expect } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ff, ffprobe } from './ffmpeg.js';
import { prepareDelivery } from './delivery.js';
const limits = { maxBytes: 1024 * 1024, maxDurationSec: 5 };
test('normalizes incompatible real video and audio codecs into H264/AAC delivery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'takeone-delivery-'));
  try {
    const input = join(dir, 'mpeg.mp4'), output = join(dir, 'ready.mp4');
    await ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=1', '-c:v', 'mpeg4', '-c:a', 'mp3', '-t', '1', input]);
    expect(await prepareDelivery(input, output, { ...limits, requireAudio: true })).toBe(output);
    expect(await ffprobe(output)).toMatchObject({ hasAudio: true, videoCodec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('accepts compatible video without another encode and rejects missing audio or exceeded limits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'takeone-delivery-'));
  try {
    const input = join(dir, 'video.mp4'), output = join(dir, 'ready.mp4');
    await ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', input]);
    expect(await prepareDelivery(input, output, limits)).toBe(input);
    await expect(prepareDelivery(input, output, { ...limits, requireAudio: true })).rejects.toThrow('audio');
    await expect(prepareDelivery(input, output, { ...limits, maxDurationSec: 0.1 })).rejects.toThrow('duration');
    await expect(prepareDelivery(input, output, { ...limits, maxBytes: 1 })).rejects.toThrow('size');
    const controller = new AbortController(); controller.abort();
    await expect(prepareDelivery(input, output, limits, controller.signal)).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('rejects a non-empty corrupt artifact instead of treating bytes as success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'takeone-delivery-'));
  try {
    const input = join(dir, 'corrupt.mp4'); await writeFile(input, 'not a video');
    await expect(prepareDelivery(input, join(dir, 'ready.mp4'), limits)).rejects.toThrow();
    const valid = join(dir, 'valid.mp4');
    await ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=1', '-c:v', 'libx264', '-movflags', '+faststart', valid]);
    const bytes = await readFile(valid); await writeFile(input, bytes.subarray(0, Math.floor(bytes.length / 2)));
    await expect(prepareDelivery(input, join(dir, 'ready.mp4'), limits)).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
