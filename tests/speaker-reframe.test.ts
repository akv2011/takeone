import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
const request = ref<'mutation'>('speakerReframe:request');
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('WORKER_SECRET', 'secret'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
 const t = convexTest(schema, modules);
 const userId = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', freeUsed: 0, credits: 5 }));
 const sourceJobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'edit', status: 'done', prompt: 'Source interview', createdAt: Date.now(), storageKey: 'videos/source/lease.mp4', aspect: '16:9' }));
 return { t, userId, sourceJobId };
}
test('owned speaker edits reserve once, retain ancestry and persist through claim', async () => {
 const { t, userId, sourceJobId } = await setup(), authed = t.withIdentity({ subject: 'owner' }), args = { sourceJobId, requestId: 'speaker-request-001' };
 const result = await authed.mutation(request, args);
 expect(await authed.mutation(request, args)).toEqual(result);
 expect(await t.run(ctx => ctx.db.get(userId))).toMatchObject({ freeUsed: 1 });
 expect(await t.run(ctx => ctx.db.get(result.jobId))).toMatchObject({ parentJobId: sourceJobId, rootJobId: sourceJobId, aspect: '9:16', speakerReframe: true });
 await t.mutation(ref<'mutation'>('jobs:pump'), {});
 expect(await t.mutation(ref<'mutation'>('generate:claimJob'), { jobId: result.jobId, workerId: 'speaker-worker', workerSecret: 'secret' })).toMatchObject({ speakerReframe: true });
});
test('foreign and unfinished sources reject without debit', async () => {
 const { t, userId, sourceJobId } = await setup();
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'other', freeUsed: 0, credits: 5 }));
 await expect(t.withIdentity({ subject: 'other' }).mutation(request, { sourceJobId, requestId: 'speaker-request-001' })).rejects.toThrow('SOURCE_UNAVAILABLE');
 await t.run(ctx => ctx.db.patch(sourceJobId, { status: 'failed' }));
 await expect(t.withIdentity({ subject: 'owner' }).mutation(request, { sourceJobId, requestId: 'speaker-request-001' })).rejects.toThrow('SOURCE_UNAVAILABLE');
 expect(await t.run(ctx => ctx.db.get(userId))).toMatchObject({ freeUsed: 0 });
});
test('paired archives are selected for caption rebuilding and content conflicts reject', async () => {
 const { t, sourceJobId } = await setup();
 await t.run(ctx => ctx.db.patch(sourceJobId, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json', captionStyle: 'clean' }));
 const authed = t.withIdentity({ subject: 'owner' });
 const { jobId } = await authed.mutation(request, { sourceJobId, requestId: 'speaker-request-001' });
 expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject({ captionTransform: true, sourceStorageKey: 'videos/source/lease-clean.mp4' });
 await expect(authed.mutation(ref<'mutation'>('generate:requestEdit'), { sourceJobId, instruction: 'Follow the single speaker', requestId: 'speaker-request-001' })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
});
test('speaker crop inherits a brand only when rebuilding from a clean archive', async () => {
 const { t, sourceJobId } = await setup();
 const brand = { font: 'serif' as const, captionStyle: 'clean' as const, textColor: '#00FF00', outlineColor: '#000000' };
 await t.run(ctx => ctx.db.patch(sourceJobId, { brand }));
 const authed = t.withIdentity({ subject: 'owner' });
 const flat = await authed.mutation(request, { sourceJobId, requestId: 'speaker-flat-001' });
 expect((await t.run(ctx => ctx.db.get(flat.jobId)))?.brand).toBeUndefined();
 await t.run(ctx => ctx.db.patch(sourceJobId, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json', captionStyle: 'clean' }));
 const archived = await authed.mutation(request, { sourceJobId, requestId: 'speaker-archive-001' });
 expect((await t.run(ctx => ctx.db.get(archived.jobId)))?.brand).toEqual(brand);
});
