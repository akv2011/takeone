import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => vi.unstubAllEnvs());
const request = ref<'mutation'>('generate:requestGeneration');
const input = { mode: 'generate' as const, prompt: 'A video about space', requestId: 'capability-request' };
async function setup() {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', freeUsed: 0, credits: 25 }));
 return t;
}
function ready() {
 vi.stubEnv('DISPATCH_URL', 'https://dispatcher.example'); vi.stubEnv('DISPATCH_SECRET', 'dispatch');
 vi.stubEnv('WORKER_SECRET', 'worker'); vi.stubEnv('STOCK_VIDEO_ENABLED', 'true');
 vi.stubEnv('YOUTUBE_INGEST_ENABLED', 'true'); vi.stubEnv('MANAGED_RENDERING_PAUSED', 'false');
}
test.each(['DISPATCH_URL', 'DISPATCH_SECRET', 'WORKER_SECRET', 'STOCK_VIDEO_ENABLED'])('missing %s rejects direct generation without a job or debit', async name => {
 ready(); vi.stubEnv(name, ''); const t = await setup();
 await expect(t.withIdentity({ subject: 'owner' }).mutation(request, input)).rejects.toThrow();
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 const user = await t.run(ctx => ctx.db.query('users').first());
 expect(user?.freeUsed).toBe(0); expect(user?.credits).toBe(25);
});
test('disabled YouTube rejects a confirmed direct request without a debit', async () => {
 ready(); vi.stubEnv('YOUTUBE_INGEST_ENABLED', 'false'); const t = await setup();
 await expect(t.withIdentity({ subject: 'owner' }).mutation(request, { ...input, mode: 'clip', prompt: 'Clip https://youtube.com/watch?v=test', confirmedOwnership: true })).rejects.toThrow();
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});
test('exact retries survive provider disablement but changed requests conflict', async () => {
 ready(); const t = await setup(); const client = t.withIdentity({ subject: 'owner' });
 const first = await client.mutation(request, input);
 vi.stubEnv('STOCK_VIDEO_ENABLED', 'false'); vi.stubEnv('DISPATCH_URL', '');
 expect(await client.mutation(request, input)).toEqual(first);
 await expect(client.mutation(request, { ...input, prompt: 'Different space story' })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});

test('AI exact retry survives disablement and pause without another reservation', async () => {
 ready(); vi.stubEnv('AI_VIDEO_ENABLED', 'true');
 const t = await setup(); const client = t.withIdentity({ subject: 'owner' });
 const ai = { ...input, generationKind: 'ai', aspect: '9:16' };
 const first = await client.mutation(request, ai);
 vi.stubEnv('AI_VIDEO_ENABLED', 'false'); vi.stubEnv('MANAGED_RENDERING_PAUSED', 'true');
 expect(await client.mutation(request, ai)).toEqual(first);
 await expect(client.mutation(request, { ...ai, prompt: 'A different mountain scene' })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 await expect(client.mutation(request, { ...ai, requestId: 'new-ai-request' })).rejects.toThrow('RENDER_UNAVAILABLE');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(1);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
