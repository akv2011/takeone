import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName, type FunctionReference } from 'convex/server';
const convex = vi.hoisted(() => ({ urls: [] as string[], mutation: vi.fn() }));
vi.mock('convex/browser', () => ({ ConvexHttpClient: class { mutation = convex.mutation; constructor(url: string) { convex.urls.push(url); } } }));
import { runOnce } from './runOnce.js';
const environment = { CONVEX_URL: 'https://argument.convex.cloud', WORKER_SECRET: 'secret', GCS_BUCKET: 'bucket' };
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'run-once-test-'));
  vi.stubEnv('TMPDIR', root); vi.stubEnv('CONVEX_URL', 'https://process.convex.cloud');
  convex.urls.length = 0; convex.mutation.mockReset().mockResolvedValue(null);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
const called = () => convex.mutation.mock.calls.map(([ref, args]) => [getFunctionName(ref as FunctionReference<'mutation'>), args]);
describe('runOnce', () => {
  it('rejects an invalid identity before touching Convex', async () => {
    await expect(runOnce({ jobId: '../x' }, environment)).rejects.toThrow('Invalid worker identifier');
    expect(convex.mutation).not.toHaveBeenCalled();
  });
  it('requires WORKER_SECRET from the environment argument', async () => {
    await expect(runOnce({ jobId: 'job-1' }, { CONVEX_URL: environment.CONVEX_URL, GCS_BUCKET: 'bucket' })).rejects.toThrow('WORKER_SECRET required');
  });
  it('skips an unclaimed job and leaves the temp dir empty, stock caches included', async () => {
    await mkdir(join(root, 'takeone-broll-cache')); await writeFile(join(root, 'takeone-broll-cache', 'clip.mp4'), 'x');
    await mkdir(join(root, 'takeone-gif-cache')); await writeFile(join(root, 'takeone-gif-cache', 's.gif'), 'x');
    expect(await runOnce({ jobId: 'job-1' }, environment)).toBe('worker_skipped');
    expect(convex.urls.length).toBeGreaterThan(0); expect(new Set(convex.urls)).toEqual(new Set([environment.CONVEX_URL]));
    expect(called()).toEqual([['generate:claimJob', { workerSecret: 'secret', jobId: 'job-1', workerId: expect.any(String) }]]);
    expect(await readdir(root)).toEqual([]);
  });
  it('reports an unclaimed upload probe', async () => {
    expect(await runOnce({ uploadId: 'upload-1' }, environment)).toBe('upload_probe_not_claimed');
    expect(called()).toEqual([['uploads:claimProbe', { workerSecret: 'secret', uploadId: 'upload-1', workerId: expect.any(String) }]]);
  });
});
