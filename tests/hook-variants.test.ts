import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import { FREE_LIMIT } from '../convex/config';
const modules = import.meta.glob('../convex/**/*.ts');
const request = ref<'mutation'>('hookVariants:request');
const titles = ['Start with this idea', 'Three seconds can change it', 'Here is the surprising part'];
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('WORKER_SECRET', 'secret'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup(freeUsed = 0, credits = 0) {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', freeUsed, credits }));
  const sourceJobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', status: 'done', prompt: 'A soap video', createdAt: Date.now(), storageKey: 'videos/source/lease.mp4', aspect: '9:16' }));
  return { t, userId, sourceJobId, args: { sourceJobId, titles, requestId: 'hooks-batch-0001' } };
}
test('three child versions reserve free-first then credits and exact retries reuse all jobs', async () => {
 const { t, userId, args } = await setup(FREE_LIMIT - 2, 4), authed = t.withIdentity({ subject: 'owner' });
 const result = await authed.mutation(request, args);
 expect(result.jobIds).toHaveLength(3);
 expect(await authed.mutation(request, args)).toEqual(result);
 expect(await t.run(ctx => ctx.db.get(userId))).toMatchObject({ freeUsed: FREE_LIMIT, credits: 3 });
 const jobs = await t.run(ctx => ctx.db.query('genJobs').filter(q => q.eq(q.field('status'), 'queued')).collect());
 expect(jobs.map(j => j.hookTitle)).toEqual(titles);
 expect(jobs.every(j => j.parentJobId === args.sourceJobId && j.rootJobId === args.sourceJobId)).toBe(true);
 await expect(authed.mutation(request, { ...args, titles: [titles[0], 'Changed second title', titles[2]] })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 expect(await t.run(ctx => ctx.db.get(userId))).toMatchObject({ freeUsed: FREE_LIMIT, credits: 3 });
});
test('insufficient allowance rolls back every job and debit', async () => {
 const { t, userId, args } = await setup(FREE_LIMIT - 1, 1);
 await expect(t.withIdentity({ subject: 'owner' }).mutation(request, args)).rejects.toThrow('NO_CREDITS');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(1);
 expect(await t.run(ctx => ctx.db.get(userId))).toMatchObject({ freeUsed: FREE_LIMIT - 1, credits: 1 });
});
test('ownership and malformed titles reject before billing', async () => {
 const { t, userId, args } = await setup();
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'other', freeUsed: 0, credits: 10 }));
 await expect(t.withIdentity({ subject: 'other' }).mutation(request, args)).rejects.toThrow('SOURCE_UNAVAILABLE');
 for (const bad of [[], ['same title', 'SAME TITLE', 'third title'], ['ok title', 'ok other', 'x'.repeat(101)]]) await expect(t.withIdentity({ subject: 'owner' }).mutation(request, { ...args, titles: bad })).rejects.toThrow('THREE_DISTINCT_HOOKS_REQUIRED');
 expect(await t.run(ctx => ctx.db.get(userId))).toMatchObject({ freeUsed: 0 });
});
test('hook title survives claim; cancellation refunds each reservation only once', async () => {
 const { t, userId, args } = await setup(), authed = t.withIdentity({ subject: 'owner' });
 const { jobIds } = await authed.mutation(request, args);
 await t.mutation(ref<'mutation'>('jobs:pump'), {});
 const claim = await t.mutation(ref<'mutation'>('generate:claimJob'), { workerSecret: 'secret', jobId: jobIds[0], workerId: 'worker-test' });
 expect(claim.hookTitle).toBe(titles[0]);
 await authed.mutation(ref<'mutation'>('generate:cancelJob'), { jobId: jobIds[1] });
 await expect(authed.mutation(ref<'mutation'>('generate:cancelJob'), { jobId: jobIds[1] })).rejects.toThrow();
 expect((await t.run(ctx => ctx.db.get(userId)))?.freeUsed).toBe(2);
 expect(await authed.mutation(request, args)).toEqual({ jobIds });
});

test.each([false, true])('hook edits inherit brand only from clean archives, not flattened logo pixels (%s)', async archived => {
 const { t, sourceJobId, args } = await setup();
 const brand = { font: 'serif' as const, captionStyle: 'clean' as const, textColor: '#12AB34', outlineColor: '#000000' };
 await t.run(ctx => ctx.db.patch(sourceJobId, { brand, ...(archived ? { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' } : {}) }));
 const { jobIds } = await t.withIdentity({ subject: 'owner' }).mutation(request, args);
 for (const id of jobIds) { const job = await t.run(ctx => ctx.db.get(id)); expect(job?.brand).toEqual(archived ? brand : undefined); expect(job?.sourceStorageKey).toBe(archived ? 'videos/source/lease-clean.mp4' : 'videos/source/lease.mp4'); }
});
