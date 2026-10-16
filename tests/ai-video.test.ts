import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', credits: 0, freeUsed: 0 }));
  return t;
}
test('AI disabled or square requests cannot reserve allowance', async () => {
  const t = await setup(), actor = t.withIdentity({ subject: 'u1' });
  const args = { mode: 'generate', generationKind: 'ai', prompt: 'A cinematic mountain sunrise', requestId: 'ai-request-1', aspect: '9:16' };
  await expect(actor.mutation(ref<'mutation'>('generate:requestGeneration'), args)).rejects.toThrow('RENDER_UNAVAILABLE');
  vi.stubEnv('AI_VIDEO_ENABLED', 'true');
  await expect(actor.mutation(ref<'mutation'>('generate:requestGeneration'), { ...args, aspect: '1:1' })).rejects.toThrow('AI_VIDEO_UNAVAILABLE');
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});
test('AI operation creation is one-shot and saved operation survives retries', async () => {
  const t = await setup(); vi.stubEnv('WORKER_SECRET', 'secret'); vi.stubEnv('AI_VIDEO_ENABLED', 'true');
  const { jobId } = await t.withIdentity({ subject: 'u1' }).mutation(ref<'mutation'>('generate:requestGeneration'), { mode: 'generate', generationKind: 'ai', prompt: 'A cinematic mountain sunrise', requestId: 'ai-request-2', aspect: '9:16' });
  await t.run(ctx => ctx.db.patch(jobId, { status: 'processing', leaseToken: 'lease1', leaseExpiresAt: Date.now() + 90000 }));
  const args = { workerSecret: 'secret', jobId, leaseToken: 'lease1' };
  expect(await t.mutation(ref<'mutation'>('generate:beginAi'), args)).toBe(true);
  expect(await t.mutation(ref<'mutation'>('generate:beginAi'), args)).toBe(false);
  const operation = 'projects/test-project/locations/us-central1/publishers/google/models/veo-3.0-generate-001/operations/op1';
  await t.mutation(ref<'mutation'>('generate:saveAiOperation'), { ...args, operation });
  await expect(t.mutation(ref<'mutation'>('generate:saveAiOperation'), { ...args, leaseToken: 'stale', operation })).rejects.toThrow('AI_LEASE_LOST');
  expect((await t.run(ctx => ctx.db.get(jobId)))?.aiOperation).toBe(operation);
  await t.run(ctx => ctx.db.patch(jobId, { status: 'dispatched', attempts: 2, leaseExpiresAt: Date.now() + 90000 }));
  const resumed = await t.mutation(ref<'mutation'>('generate:claimJob'), { workerSecret: 'secret', jobId, workerId: 'retry-worker' });
  expect(resumed.aiOperation).toBe(operation);
  expect(resumed.generationKind).toBe('ai');
  expect(await t.mutation(ref<'mutation'>('generate:beginAi'), { ...args, leaseToken: resumed.leaseToken })).toBe(false);
});
