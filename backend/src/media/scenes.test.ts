import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('./broll.js', async importOriginal => ({ ...await importOriginal<typeof import('./broll.js')>(), fetchStockBroll: vi.fn() }));
vi.mock('./ffmpeg.js', () => ({ ff: vi.fn(async () => {}), ffprobe: vi.fn(async () => ({ hasVideo: true, durationSec: 8 })) }));
import { renderStockScenes } from './scenes.js';
import { fetchStockBroll } from './broll.js';
import { ff, ffprobe } from './ffmpeg.js';
import type { ScenePlan } from '../content/scenes.js';
const plan = (): ScenePlan => ({ version: 1, brief: { audience: 'founders', promise: 'launch story', visualNouns: ['laptop'], setting: 'office', lighting: 'night', cameraMotion: 'static', pacing: 'quick', restrictedTerms: [] }, scenes: [
  { startSec: 0, endSec: 3, purpose: 'Build', searchTerms: ['founder laptop office'], shotType: 'closeup', motion: 'static' },
  { startSec: 3, endSec: 6, purpose: 'Collaborate', searchTerms: ['startup team whiteboard'], shotType: 'wide', motion: 'pan' },
] });
let dir: string;
let files: string[];
beforeEach(async () => {
  vi.clearAllMocks(); dir = await mkdtemp(join(tmpdir(), 'scene-test-'));
  files = [join(dir, 'one.mp4'), join(dir, 'two.mp4')];
  await writeFile(files[0], 'first'); await writeFile(files[1], 'second');
  vi.mocked(fetchStockBroll).mockReset().mockResolvedValueOnce(files[0]).mockResolvedValueOnce(files[1]);
  vi.mocked(ffprobe).mockImplementation(async path => {
    const args = vi.mocked(ff).mock.calls.find(([args]) => args.at(-1) === path)?.[0];
    return { hasVideo: true, durationSec: args ? Number(args[args.indexOf('-t') + 1]) : 8, width: 100, height: 100, hasAudio: false };
  });
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
test('resolves the planned founder queries and assembles bounded distinct shots without looping', async () => {
  expect(await renderStockScenes(plan(), 6, { tmpDir: dir, isPro: true, strictMedia: true })).toBe(join(dir, 'planned-scenes.mp4'));
  expect(vi.mocked(fetchStockBroll).mock.calls.map(args => args[0])).toEqual([['founder laptop office'], ['startup team whiteboard']]);
  const calls = vi.mocked(ff).mock.calls.map(args => args[0]);
  expect(calls).toHaveLength(3);
  expect(calls.every(args => !args.includes('-stream_loop'))).toBe(true);
  expect(calls[0][calls[0].indexOf('-t') + 1]).toBe('3');
  expect(calls[2]).toContain('concat');
  expect(calls[2]).toContain('copy');
});
test('does not begin rendering if any scene has no stock', async () => {
  vi.mocked(fetchStockBroll).mockReset().mockResolvedValueOnce(files[0]).mockResolvedValueOnce(null);
  await expect(renderStockScenes(plan(), 6, { tmpDir: dir, isPro: true })).rejects.toThrow('no usable footage');
  expect(ff).not.toHaveBeenCalled();
});
test('rejects the same footage bytes across different cached files and queries', async () => {
  await writeFile(files[1], 'first');
  await expect(renderStockScenes(plan(), 6, { tmpDir: dir, isPro: true })).rejects.toThrow('repeated footage');
  expect(ff).not.toHaveBeenCalled();
});
test('does not stretch or loop footage shorter than the scene', async () => {
  vi.mocked(ffprobe).mockResolvedValue({ hasVideo: true, durationSec: 2.9, width: 100, height: 100, hasAudio: false });
  await expect(renderStockScenes(plan(), 6, { tmpDir: dir, isPro: true })).rejects.toThrow('shorter');
  expect(ff).not.toHaveBeenCalled();
});
test('pre-aborted scene resolution never searches or renders', async () => {
  const controller = new AbortController(); controller.abort(Error('lease lost'));
  await expect(renderStockScenes(plan(), 6, { tmpDir: dir, isPro: true, signal: controller.signal })).rejects.toThrow('lease lost');
  expect(fetchStockBroll).not.toHaveBeenCalled(); expect(ff).not.toHaveBeenCalled();
});
test.each([['1:1', 'scale=1080:1080'], ['16:9', 'scale=1920:1080']] as const)('normalizes directly to requested aspect %s', async (aspect, scale) => {
  await renderStockScenes(plan(), 6, { tmpDir: dir, isPro: true }, aspect);
  const args = vi.mocked(ff).mock.calls[0][0];
  expect(args[args.indexOf('-vf') + 1]).toContain(scale);
});

test('cache replacement after selection cannot change this attempt’s rendered bytes', async () => {
  vi.mocked(fetchStockBroll).mockReset().mockResolvedValueOnce(files[0]).mockImplementationOnce(async () => {
    await writeFile(files[0], 'replacement');
    return files[1];
  });
  await renderStockScenes(plan(), 6, { tmpDir: dir, isPro: true });
  const selectedPath = vi.mocked(ff).mock.calls[0][0][1];
  expect(await readFile(selectedPath, 'utf8')).toBe('first');
  expect(await readFile(files[0], 'utf8')).toBe('replacement');
});
test('fractional scene boundaries share a frame grid without cumulative drift', async () => {
  const fractional = plan();
  fractional.scenes[0].endSec = 3.015;
  fractional.scenes[1].startSec = 3.015;
  await renderStockScenes(fractional, 6, { tmpDir: dir, isPro: true });
  const durations = vi.mocked(ff).mock.calls.slice(0, 2).map(([args]) => Number(args[args.indexOf('-t') + 1]));
  expect(durations).toEqual([91 / 30, 89 / 30]);
  expect(durations[0] + durations[1]).toBe(6);
});

test('a short encoded video cannot borrow duration from the stock audio tail', async () => {
  vi.mocked(ffprobe).mockImplementation(async path => ({ hasVideo: true, durationSec: path.endsWith('scene-0.mp4') ? 1 : 4, width: 100, height: 100, hasAudio: false }));
  await expect(renderStockScenes(plan(), 6, { tmpDir: dir, isPro: true })).rejects.toThrow('does not cover');
  expect(ff).toHaveBeenCalledTimes(1);
});
