import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
vi.mock('./broll.js', async importOriginal => ({ ...await importOriginal<typeof import('./broll.js')>(), fetchStockBroll: vi.fn() }));
import { renderStockScenes } from './scenes.js';
import { fetchStockBroll } from './broll.js';
import { ff, ffprobe } from './ffmpeg.js';
import type { ScenePlan } from '../content/scenes.js';
const exec = promisify(execFile);
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scene-real-'));
  for (const color of ['red', 'blue']) await ff(['-f', 'lavfi', '-i', `color=c=${color}:s=160x90:r=30:d=1.2`, '-an', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', join(dir, `${color}.mp4`)]);
}, 60_000);
afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
const plan: ScenePlan = { version: 1, brief: { audience: 'test', promise: 'two shots', visualNouns: ['colors'], setting: 'studio', lighting: 'even', cameraMotion: 'static', pacing: 'quick', restrictedTerms: [] }, scenes: [
  { startSec: 0, endSec: 1, purpose: 'first', searchTerms: ['red'], shotType: 'wide', motion: 'static' },
  { startSec: 1, endSec: 2, purpose: 'second', searchTerms: ['blue'], shotType: 'wide', motion: 'static' },
] };
test.each([['9:16', 1080, 1920], ['1:1', 1080, 1080], ['16:9', 1920, 1080]] as const)('real scene cut preserves colors, duration and %s canvas', async (aspect, width, height) => {
  vi.mocked(fetchStockBroll).mockImplementation(async terms => join(dir, `${terms[0]}.mp4`));
  const workDir = join(dir, aspect.replace(':', '-'));
  await mkdir(workDir);
  const output = await renderStockScenes(plan, 2, { tmpDir: workDir, isPro: true, strictMedia: true }, aspect);
  const meta = await ffprobe(output);
  expect(meta).toMatchObject({ width, height, hasVideo: true, hasAudio: false });
  expect(Math.abs(meta.durationSec - 2)).toBeLessThan(0.05);
  for (const [time, channel] of [[0.5, 0], [1.5, 2]]) {
    const { stdout } = await exec('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', output, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
    expect(stdout[channel]).toBeGreaterThan(200);
    expect(stdout[channel === 0 ? 2 : 0]).toBeLessThan(30);
  }
  await exec('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-']);
}, 120_000);

test('real video duration cannot be extended by a longer original audio stream', async () => {
  const source = join(dir, 'audio-tail.mp4');
  await ff(['-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', '-pix_fmt', 'yuv420p', source]);
  expect((await ffprobe(source)).durationSec).toBeGreaterThanOrEqual(4);
  const workDir = join(dir, 'audio-tail'); await mkdir(workDir);
  const longer: ScenePlan = { ...plan, scenes: [
    { ...plan.scenes[0], endSec: 3 },
    { ...plan.scenes[1], startSec: 3, endSec: 4 },
  ] };
  vi.mocked(fetchStockBroll).mockImplementation(async terms => terms[0] === 'red' ? source : join(dir, 'blue.mp4'));
  await expect(renderStockScenes(longer, 4, { tmpDir: workDir, isPro: true, strictMedia: true }, '1:1')).rejects.toThrow('does not cover');
}, 120_000);
