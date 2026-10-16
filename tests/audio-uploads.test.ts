import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => vi.unstubAllEnvs());
const args = { kind: 'audio', confirmedOwnership: true, name: 'track.mp3', size: 5, contentType: 'audio/mpeg' };
async function setup() {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', freeUsed: 0, credits: 0 }));
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u2', freeUsed: 0, credits: 0 }));
 return { t, actor: t.withIdentity({ subject: 'u1' }), other: t.withIdentity({ subject: 'u2' }) };
}
async function upload() {
 const ctx = await setup();
 const { uploadId } = await ctx.actor.mutation(ref<'mutation'>('uploads:begin'), args);
 const storageId = await ctx.t.run(db => db.storage.store(new Blob(['audio'], { type: 'audio/mpeg' })));
 await ctx.t.run(db => (db.db as any).patch(storageId, { contentType: 'audio/mpeg' }));
 await ctx.actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId, storageId });
 return { ...ctx, uploadId, storageId, trackId: `upload:${uploadId}` };
}
test.each([{ confirmedOwnership: false }, { size: 20 * 1024 * 1024 + 1 }, { contentType: 'video/mp4' }])('audio begin rejects invalid rights/type/size %j', async change => {
 const { t, actor } = await setup();
 await expect(actor.mutation(ref<'mutation'>('uploads:begin'), { ...args, ...change })).rejects.toThrow();
 expect(await t.run(ctx => ctx.db.query('uploads').collect())).toHaveLength(0);
});
test('audio is owner-private, cannot be used as a video source, and previews without spending', async () => {
 const { t, actor, other, uploadId, trackId } = await upload();
 expect(await actor.query(ref<'query'>('uploads:list'), {})).toEqual([]);
 expect(await actor.query(ref<'query'>('uploads:list'), { kind: 'audio' })).toHaveLength(1);
 expect(await other.query(ref<'query'>('music:listTracks'), {})).not.toContainEqual(expect.objectContaining({ id: trackId }));
 expect(await actor.query(ref<'query'>('music:listTracks'), {})).toContainEqual(expect.objectContaining({ id: trackId, label: 'track.mp3' }));
 await expect(other.action(ref<'action'>('music:preview'), { trackId })).rejects.toThrow('MUSIC_UNAVAILABLE');
 expect(await actor.action(ref<'action'>('music:preview'), { trackId })).toEqual({ url: expect.any(String) });
 await expect(actor.mutation(ref<'mutation'>('uploads:requestEdit'), { uploadId, instruction: 'Make it vertical', requestId: 'audio-as-video', aspect: '9:16', confirmedOwnership: true })).rejects.toThrow('UPLOAD_NOT_READY');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});
test('render snapshots owned audio, claims its URL, and protects it until the job is terminal', async () => {
 const { t, actor, other, uploadId, storageId, trackId } = await upload();
 const request = { mode: 'generate', prompt: 'An introduction to cooking', requestId: 'owned-audio-render', music: { trackId, volume: 0.2, duck: true } };
 await expect(other.mutation(ref<'mutation'>('generate:requestGeneration'), request)).rejects.toThrow('MUSIC_UNAVAILABLE');
 const first = await actor.mutation(ref<'mutation'>('generate:requestGeneration'), request);
 expect(await actor.mutation(ref<'mutation'>('generate:requestGeneration'), request)).toEqual(first);
 const job = await t.run(ctx => ctx.db.get(first.jobId));
 expect(job).toMatchObject({ musicStorageId: storageId, music: { trackId, storageId, volume: 0.2 } });
 await expect(actor.mutation(ref<'mutation'>('uploads:remove'), { uploadId })).rejects.toThrow('UPLOAD_IN_USE');
 vi.stubEnv('WORKER_SECRET', 'worker');
 await t.run(ctx => ctx.db.patch(first.jobId, { status: 'dispatched', attempts: 1, leaseExpiresAt: Date.now() + 60000 }));
 const claimed = await t.mutation(ref<'mutation'>('generate:claimJob'), { jobId: first.jobId, workerSecret: 'worker', workerId: 'worker-id-1' });
 expect(claimed.music).toMatchObject({ storageUrl: expect.any(String), volume: 0.2 });
 await expect(actor.mutation(ref<'mutation'>('uploads:remove'), { uploadId })).rejects.toThrow('UPLOAD_IN_USE');
 await t.run(ctx => ctx.db.patch(first.jobId, { status: 'done' }));
 await actor.mutation(ref<'mutation'>('uploads:remove'), { uploadId });
 expect(await t.run(ctx => ctx.storage.get(storageId))).toBeNull();
 await expect(actor.action(ref<'action'>('music:preview'), { trackId })).rejects.toThrow('MUSIC_UNAVAILABLE');
 await expect(actor.mutation(ref<'mutation'>('generate:requestGeneration'), { ...request, requestId: 'after-audio-removal' })).rejects.toThrow('MUSIC_UNAVAILABLE');
 expect(await actor.mutation(ref<'mutation'>('generate:requestGeneration'), request)).toEqual(first);
});
test('audio finalization checks the actual stored MIME and size', async () => {
 const { t, actor } = await setup();
 const { uploadId } = await actor.mutation(ref<'mutation'>('uploads:begin'), args);
 const storageId = await t.run(ctx => ctx.storage.store(new Blob(['wrong'], { type: 'video/mp4' })));
 await t.run(ctx => (ctx.db as any).patch(storageId, { contentType: 'video/mp4' }));
 await expect(actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId, storageId })).rejects.toThrow('INVALID_UPLOAD');
 expect((await t.run(ctx => ctx.db.get(uploadId)))?.status).toBe('pending');
});

test('finalization cannot exceed the shared ready-source limit after begin', async () => {
 const { t, actor } = await setup();
 const { uploadId } = await actor.mutation(ref<'mutation'>('uploads:begin'), args);
 const storageId = await t.run(ctx => ctx.storage.store(new Blob(['audio'])));
 await t.run(async ctx => {
  await (ctx.db as any).patch(storageId, { contentType: 'audio/mpeg' });
  for (let i = 0; i < 10; i++) await ctx.db.insert('uploads', { userId: 'u1', name: `saved-${i}.mp4`, size: 5, contentType: 'video/mp4', status: 'ready', createdAt: Date.now() });
 });
 await expect(actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId, storageId })).rejects.toThrow('UPLOAD_LIMIT');
 expect((await t.run(ctx => ctx.db.get(uploadId)))?.status).toBe('pending');
});
