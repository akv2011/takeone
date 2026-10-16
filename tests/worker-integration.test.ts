import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import { runWorker } from '../backend/src/managed/worker';
const modules = import.meta.glob('../convex/**/*.ts');
const outputMetadata = { mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true };
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('WORKER_SECRET', 'integration-secret'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
test('eleven accounts traverse real queue/worker contracts with ten renders overlapping and one waiting', async () => {
 const t = convexTest(schema, modules);
 const ids: string[] = [];
 for (let i = 0; i < 11; i++) {
   await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: `u${i}`, freeUsed: 0, credits: 0 }));
   const { jobId } = await t.withIdentity({ subject: `u${i}` }).mutation(ref<'mutation'>('generate:requestGeneration'), { mode: 'generate', aspect: '9:16', prompt: 'Make a reel about space', requestId: 'integration-request' });
   ids.push(jobId);
 }
 await t.mutation(ref<'mutation'>('jobs:pump'), {});
 let release!: () => void; const gate = new Promise<void>(r => { release = r; });
 let tenStarted!: () => void; const started = new Promise<void>(r => { tenStarted = r; });
 let active = 0, peak = 0;
 const call = (name: string, args: object) => t.mutation(ref<'mutation'>(`generate:${name}`), { workerSecret: 'integration-secret', ...args });
 const execute = (jobId: string) => runWorker(jobId, {
   claim: async id => call('claimJob', { jobId: id, workerId: 'worker-integration' }),
   heartbeat: async j => call('heartbeat', { jobId: j.jobId, leaseToken: j.leaseToken }),
   render: async () => { peak = Math.max(peak, ++active); if (active === 10) tenStarted(); await gate; active--; return '/mock/output.mp4'; },
   inspect: async () => outputMetadata,
   upload: async () => {},
   complete: async (j, storageKey, metadata) => call('completeJob', { ...metadata, jobId: j.jobId, leaseToken: j.leaseToken, storageKey }),
   fail: async (j, error) => call('failJob', { jobId: j.jobId, leaseToken: j.leaseToken, error }),
   cleanup: async () => {}, deliver: async () => {}, log: () => {},
 });
 const firstTen = ids.slice(0,10).map(execute);
 await started;
 expect(await execute(ids[10])).toBe('skipped'); expect(peak).toBe(10);
 release(); expect(await Promise.all(firstTen)).toEqual(Array(10).fill('completed'));
 await t.mutation(ref<'mutation'>('jobs:pump'), {});
 expect(await execute(ids[10])).toBe('completed');
 const jobs = await t.run(ctx => ctx.db.query('genJobs').collect());
 expect(jobs.every(j => j.status === 'done')).toBe(true);
 expect((await t.run(ctx => ctx.db.query('users').collect())).every(u => u.freeUsed === 1)).toBe(true);
});
