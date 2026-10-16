import { convexTest } from 'convex-test';
import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
 const t = convexTest(schema, modules);
 const user = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 3, freeUsed: 0 }));
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'other', credits: 3, freeUsed: 0 }));
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Original source', status: 'done', createdAt: Date.now(), aspect: '1:1', storageKey: 'videos/source/lease.mp4', cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json', captionStyle: 'clean', captionFont: 'serif' }));
 return { t, user, source, actor: t.withIdentity({ subject: 'owner' }) };
}
test('structured edits preserve archives, identity, allowance and worker contract', async () => {
 const { t, user, source, actor } = await setup();
 const args = { sourceJobId: source, requestId: 'structured-request', transforms: { trim: { start: 1.125, end: 3.875 }, speed: 3, fit: 'fit' } };
 const result = await actor.mutation(ref<'mutation'>('generate:requestEdit'), args);
 expect(await actor.mutation(ref<'mutation'>('generate:requestEdit'), { ...args, transforms: { ...args.transforms, aspect: '1:1' } })).toEqual(result);
 expect((await t.run(ctx => ctx.db.get(user)))?.freeUsed).toBe(1);
 expect(await t.run(ctx => ctx.db.get(result.jobId))).toMatchObject({ parentJobId: source, rootJobId: source, captionTransform: true, captionFont: 'serif', sourceStorageKey: 'videos/source/lease-clean.mp4', transforms: { ...args.transforms, aspect: '1:1' } });
 await expect(actor.mutation(ref<'mutation'>('generate:requestEdit'), { ...args, transforms: { ...args.transforms, speed: 2 } })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 vi.stubEnv('WORKER_SECRET', 'fixture-secret');
 await t.run(ctx => ctx.db.patch(result.jobId, { status: 'dispatched', attempts: 1, leaseExpiresAt: Date.now() + 60000 }));
 expect(await t.mutation(ref<'mutation'>('generate:claimJob'), { jobId: result.jobId, workerId: 'worker-123', workerSecret: 'fixture-secret' })).toMatchObject({ transforms: { ...args.transforms, aspect: '1:1' } });
});
test('invalid transforms and foreign sources do not reserve allowance', async () => {
 const { t, user, source, actor } = await setup();
 for (const transforms of [{ trim: { start: -1, end: 2 } }, { trim: { start: 2, end: 2 } }, { trim: { start: 0, end: 301 } }, { trim: { start: 0.0001, end: 1 } }, { speed: 0 }, { speed: 3.1 }, { speed: 4 }, { speed: 1.1 }, { aspect: '4:3' }, { fit: 'stretch' }]) {
  await expect(actor.mutation(ref<'mutation'>('generate:requestEdit'), { sourceJobId: source, requestId: 'invalid-transform', transforms })).rejects.toThrow();
 }
 await expect(actor.mutation(ref<'mutation'>('generate:requestEdit'), { sourceJobId: source, requestId: 'ambiguous-request', instruction: 'Speed up 2x', transforms: { speed: 1 } })).rejects.toThrow('AMBIGUOUS_EDIT');
 await expect(t.withIdentity({ subject: 'other' }).mutation(ref<'mutation'>('generate:requestEdit'), { sourceJobId: source, requestId: 'foreign-request', transforms: { speed: 2 } })).rejects.toThrow('SOURCE_UNAVAILABLE');
 expect((await t.run(ctx => ctx.db.get(user)))?.freeUsed).toBe(0);
});
test('upload transforms require rights and a ready owned video, and normalize before replay', async () => {
 const { t, user, actor } = await setup();
 const storageId = await t.run(ctx => ctx.storage.store(new Blob(['fixture'], { type: 'video/mp4' })));
 const uploadId = await t.run(ctx => ctx.db.insert('uploads', { userId: 'owner', name: 'fixture.mp4', size: 7, contentType: 'video/mp4', kind: 'video', status: 'ready', createdAt: Date.now(), storageId, mediaDurationMs: 10_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true }));
 const args = { uploadId, confirmedOwnership: true, aspect: '16:9', requestId: 'structured-upload', transforms: { fit: 'fit' }, captionStyle: 'none' };
 await expect(actor.mutation(ref<'mutation'>('uploads:requestEdit'), { ...args, confirmedOwnership: false })).rejects.toThrow('CONFIRM_VIDEO_RIGHTS');
 await expect(t.withIdentity({ subject: 'other' }).mutation(ref<'mutation'>('uploads:requestEdit'), args)).rejects.toThrow('UPLOAD_NOT_READY');
 await expect(actor.mutation(ref<'mutation'>('uploads:requestEdit'), { ...args, transforms: { aspect: '1:1' } })).rejects.toThrow('AMBIGUOUS_EDIT');
 expect((await t.run(ctx => ctx.db.get(user)))?.freeUsed).toBe(0);
 const result = await actor.mutation(ref<'mutation'>('uploads:requestEdit'), args);
 expect(await actor.mutation(ref<'mutation'>('uploads:requestEdit'), { ...args, transforms: { aspect: '16:9', fit: 'fit', speed: 1 } })).toEqual(result);
 expect(await t.run(ctx => ctx.db.get(result.jobId))).toMatchObject({ sourceStorageId: storageId, captionStyle: 'none', transforms: { aspect: '16:9', fit: 'fit', speed: 1 } });
 await expect(actor.mutation(ref<'mutation'>('uploads:requestEdit'), { ...args, transforms: { fit: 'crop' } })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 expect((await t.run(ctx => ctx.db.get(user)))?.freeUsed).toBe(1);
});
