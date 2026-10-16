import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
const outputMetadata = { mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); vi.stubEnv('WORKER_SECRET', 'progress-secret'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'topic', status: 'dispatched', attempts: 1, createdAt: Date.now() - 100, leaseExpiresAt: Date.now() + 60_000 }));
  const call = (name: string, args: object = {}) => t.mutation(ref<'mutation'>(`generate:${name}`), { workerSecret: 'progress-secret', jobId, ...args });
  const claim = await call('claimJob', { workerId: 'worker-progress' });
  const progress = (stage: string, leaseToken = claim.leaseToken) => call('reportProgress', { leaseToken, stage });
  const read = () => t.run(ctx => ctx.db.get(jobId));
  return { t, jobId, call, claim, progress, read };
}
test('records bounded server-timed stages, ignoring duplicate and out-of-order calls', async () => {
  const { progress, read } = await setup();
  expect(await progress('script')).toBe(true);
  vi.setSystemTime(1_001_000);
  await Promise.all([progress('narration'), progress('script')]);
  await progress('narration');
  await progress('saving');
  await progress('cut');
  expect((await read())?.renderProgress?.stages).toEqual([
    { stage: 'script', startedAt: 1_000_000 }, { stage: 'narration', startedAt: 1_001_000 }, { stage: 'saving', startedAt: 1_001_000 },
  ]);
  await expect(progress('provider secret text')).rejects.toThrow();
});
test('rejects wrong tokens, expired leases, cancelled jobs and unauthorized workers', async () => {
  const { t, jobId, progress, read } = await setup();
  expect(await progress('script', 'another-worker')).toBe(false);
  await expect(t.mutation(ref<'mutation'>('generate:reportProgress'), { workerSecret: 'wrong', jobId, leaseToken: 'another-worker', stage: 'script' })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(jobId, { leaseExpiresAt: Date.now() }));
  expect(await progress('script')).toBe(false);
  await t.run(ctx => ctx.db.patch(jobId, { status: 'cancelled', leaseExpiresAt: Date.now() + 1000 }));
  expect(await progress('script')).toBe(false);
  expect((await read())?.renderProgress?.stages).toEqual([]);
});
test('retry starts empty, preserves previous attempt evidence, and fences stale updates', async () => {
  const { t, jobId, call, claim, progress, read } = await setup();
  await progress('checking');
  vi.setSystemTime(1_002_000);
  await call('failJob', { leaseToken: claim.leaseToken, error: 'ignored provider text' });
  const previous = (await read())?.renderProgress;
  expect(previous?.finishedAt).toBe(1_002_000);
  await t.run(ctx => ctx.db.patch(jobId, { status: 'dispatched', attempts: 2, leaseExpiresAt: Date.now() + 10_000 }));
  const second = await call('claimJob', { workerId: 'worker-progress' });
  expect(await progress('saving')).toBe(false);
  await progress('script', second.leaseToken);
  const job = await read();
  expect(job?.renderProgressHistory).toEqual([previous]);
  expect(job?.renderProgress?.attempt).toBe(2);
  expect(job?.renderProgress?.stages.map(s => s.stage)).toEqual(['script']);
  const visible = await t.withIdentity({ subject: 'owner' }).query(ref<'query'>('generate:getJob'), { jobId });
  expect(visible.renderProgress.attempt).toBe(2);
  expect(visible).not.toHaveProperty('renderProgressHistory');
  expect(await t.withIdentity({ subject: 'other' }).query(ref<'query'>('generate:getJob'), { jobId })).toBeNull();
});
test('completion freezes timing and later reports cannot change it', async () => {
  const { call, claim, progress, read } = await setup();
  await progress('saving');
  vi.setSystemTime(1_005_000);
  await call('completeJob', { ...outputMetadata, leaseToken: claim.leaseToken, storageKey: `videos/${claim.jobId}/${claim.leaseToken}.mp4` });
  expect(await progress('saving')).toBe(false);
  expect((await read())?.renderProgress?.finishedAt).toBe(1_005_000);
});
