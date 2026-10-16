import { expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { mixMusic } from './music.js';
import { ff, ffprobe } from './ffmpeg.js';

// Decode actual output samples, rather than asserting that an FFmpeg graph contains a filter.
async function rms(path: string, start: number, duration: number, frequency: number): Promise<number> {
  const samples = await new Promise<Buffer>((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', path, '-ss', String(start), '-t', String(duration), '-vn', '-af', `bandpass=f=${frequency}:width_type=h:w=80`, '-ar', '48000', '-ac', '1', '-f', 'f32le', 'pipe:1']);
    const chunks: Buffer[] = []; p.stdout.on('data', chunk => chunks.push(chunk));
    p.on('error', reject); p.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(Error('decode failed')));
  });
  let sum = 0; for (let i = 0; i < samples.length; i += 4) sum += samples.readFloatLE(i) ** 2;
  return Math.sqrt(sum / (samples.length / 4));
}
test('real music mix ducks under speech, loops a short track, preserves duration and fades out', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'takeone-music-'));
  try {
    const source = join(dir, 'source.mp4'), track = join(dir, 'track.wav'), output = join(dir, 'mixed.mp4');
    await ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=25:d=6', '-f', 'lavfi', '-i', "aevalsrc=if(between(t\\,2\\,4)\\,0.5*sin(2*PI*440*t)\\,0):s=48000:d=6", '-c:v', 'libx264', '-c:a', 'aac', '-t', '6', source]);
    await ff(['-f', 'lavfi', '-i', 'sine=frequency=1200:duration=1:sample_rate=48000', track]);
    await mixMusic(source, output, { trackPath: track, volume: 0.5, fadeInSec: 0.2, fadeOutSec: 1 });
    const meta = await ffprobe(output);
    expect(meta.hasAudio).toBe(true); expect(meta.width).toBe(320);
    expect(Math.abs(meta.durationSec - 6)).toBeLessThan(0.1);
    const before = await rms(output, 1, 0.5, 1200), during = await rms(output, 3, 0.5, 1200);
    expect(before).toBeGreaterThan(0.005);
    expect(during).toBeLessThan(before * 0.45);
    const unDucked = join(dir, 'no-duck.mp4');
    await mixMusic(source, unDucked, { trackPath: track, volume: 0.5, duck: false });
    expect(await rms(unDucked, 3, 0.5, 1200)).toBeGreaterThan(before * 0.8);
    expect(await rms(output, 3, 0.5, 440)).toBeGreaterThan(0.2);
    expect(await rms(output, 5.8, 0.15, 1200)).toBeLessThan(before * 0.3);
    const replaced = join(dir, 'replaced.mp4');
    await mixMusic(source, replaced, { trackPath: track, volume: 0.5, replaceSourceAudio: true });
    // The finite-width bandpass admits some 1200 Hz bed energy at 440 Hz.
    // Compare with a source-silent interval and the original speech mix instead of assuming zero leakage.
    const replacementVoiceBand = await rms(replaced, 3, 0.5, 440);
    expect(replacementVoiceBand).toBeLessThan((await rms(output, 3, 0.5, 440)) * 0.03);
    expect(replacementVoiceBand).toBeCloseTo(await rms(replaced, 1, 0.5, 440), 3);
    expect(await rms(replaced, 3, 0.5, 1200)).toBeGreaterThan(before * 0.8);
    expect((await ffprobe(replaced)).durationSec).toBeCloseTo(6, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30000);

test('silent video receives music and rejects invalid settings or tracks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'takeone-music-'));
  try {
    const source = join(dir, 'silent.mp4'), track = join(dir, 'track.wav'), output = join(dir, 'mixed.mp4');
    await ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=25:d=2', '-an', '-c:v', 'libx264', source]);
    await ff(['-f', 'lavfi', '-i', 'sine=frequency=1200:duration=3', track]);
    await mixMusic(source, output, { trackPath: track, duck: false });
    expect((await ffprobe(output)).hasAudio).toBe(true);
    expect((await ffprobe(output)).durationSec).toBeCloseTo(2, 1);
    expect(await rms(output, 0.5, 0.5, 1200)).toBeGreaterThan(0.005);
    await expect(mixMusic(source, output, { trackPath: 'https://example.org/music.mp3' })).rejects.toThrow('local');
    await expect(mixMusic(source, output, { trackPath: track, volume: Number.NaN })).rejects.toThrow('settings');
    await expect(mixMusic(source, output, { trackPath: source })).rejects.toThrow('audio');
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30000);
