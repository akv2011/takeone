import { convexTest } from 'convex-test';
import { expect, test, vi, afterEach } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', freeUsed: 0, credits: 0 }));
  const actor = t.withIdentity({ subject: 'u1' });
  const session = await actor.mutation(ref<'mutation'>('uploads:begin'), { name: 'video.mp4', contentType: 'video/mp4', size: 5 });
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(['hello'], { type: 'video/mp4' })));
  // convex-test storeBlob omits contentType; emulate the actual upload metadata explicitly.
  await t.run(ctx => (ctx.db as any).patch(storageId, { contentType: 'video/mp4' }));
  return { t, actor, session, storageId };
}
async function completeProbe(t: ReturnType<typeof convexTest>, uploadId: any, storageId: any, metadata: Record<string, unknown> = {}) {
  vi.stubEnv('WORKER_SECRET', 'upload-probe-secret');
  const claim = await t.mutation(ref<'mutation'>('uploads:claimProbe'), {
    workerSecret: 'upload-probe-secret', uploadId, workerId: 'probe-worker-1',
  }) as any;
  expect(claim).toMatchObject({ uploadId, userId: 'u1', storageId, size: 5 });
  await expect(t.mutation(ref<'mutation'>('uploads:completeProbe'), {
    workerSecret: 'upload-probe-secret', uploadId, probeToken: claim.probeToken, storageId,
    mediaDurationMs: 1_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true, ...metadata,
  })).resolves.toBe(true);
  return claim;
}
test('upload finalization and edit submission are replay safe and reserve one generation', async () => {
  const { t, actor, session, storageId } = await setup();
  const finish = () => actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
  await finish(); await finish();
  expect((await t.run(ctx => ctx.db.get(session.uploadId)))?.status).toBe('preparing');
  await expect(actor.query(ref<'query'>('uploads:list'), {})).resolves.toEqual([]);
  await expect(actor.mutation(ref<'mutation'>('uploads:requestEdit'), { uploadId: session.uploadId, instruction: 'Make this square', aspect: '1:1', confirmedOwnership: true, requestId: 'too-early' })).rejects.toThrow('UPLOAD_NOT_READY');
  await completeProbe(t, session.uploadId, storageId);
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
  const submit = () => actor.mutation(ref<'mutation'>('uploads:requestEdit'), { uploadId: session.uploadId, instruction: 'Make this square', aspect: '1:1', confirmedOwnership: true, captionStyle: 'none', requestId: 'upload-request-1' });
  const first = await submit(), second = await submit();
  expect(first.jobId).toBe(second.jobId);
  expect((await t.run(ctx => ctx.db.get(first.jobId)))?.captionStyle).toBe('none');
  expect((await t.run(ctx => ctx.db.get(first.jobId)))?.sourceStorageId).toBe(storageId);
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
test('another user cannot finalize or render an owned upload', async () => {
  const { t, actor, session, storageId } = await setup();
  await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u2', freeUsed: 0, credits: 0 }));
  const other = t.withIdentity({ subject: 'u2' });
  await expect(other.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId })).rejects.toThrow('UPLOAD_NOT_FOUND');
  await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
  await expect(other.mutation(ref<'mutation'>('uploads:requestEdit'), { uploadId: session.uploadId, instruction: 'Make this square', aspect: '1:1', confirmedOwnership: true, requestId: 'upload-request-2' })).rejects.toThrow('UPLOAD_NOT_READY');
});
test('pending and unconfirmed uploads cannot submit a render', async () => {
  const { actor, session } = await setup();
  const args = { uploadId: session.uploadId, instruction: 'Make this square', aspect: '1:1', requestId: 'upload-request-3' };
  await expect(actor.mutation(ref<'mutation'>('uploads:requestEdit'), { ...args, confirmedOwnership: false })).rejects.toThrow('CONFIRM_VIDEO_RIGHTS');
  await expect(actor.mutation(ref<'mutation'>('uploads:requestEdit'), { ...args, confirmedOwnership: true })).rejects.toThrow('UPLOAD_NOT_READY');
});
test('server rejects actual metadata mismatch, oversized declarations, expiry and session floods', async () => {
  const { t, actor, session } = await setup();
  const wrong = await t.run(ctx => ctx.storage.store(new Blob(['wrong-size'], { type: 'text/plain' })));
  await expect(actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId: wrong })).rejects.toThrow('INVALID_UPLOAD');
  await expect(actor.mutation(ref<'mutation'>('uploads:begin'), { name: 'video.mp4', size: 60 * 1024 * 1024, contentType: 'video/mp4' })).rejects.toThrow('INVALID_UPLOAD');
  for (let i = 0; i < 4; i++) await actor.mutation(ref<'mutation'>('uploads:begin'), { name: 'video.mp4', size: 5, contentType: 'video/mp4' });
  await expect(actor.mutation(ref<'mutation'>('uploads:begin'), { name: 'video.mp4', size: 5, contentType: 'video/mp4' })).rejects.toThrow('UPLOAD_LIMIT');
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 3601000);
  await expect(actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId: wrong })).rejects.toThrow('UPLOAD_EXPIRED');
});
test('library listing is owner scoped; removal blocks active jobs then frees storage', async () => {
  const { t, actor, session, storageId } = await setup();
  await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
  await completeProbe(t, session.uploadId, storageId);
  expect(await actor.query(ref<'query'>('uploads:list'), {})).toHaveLength(1);
  expect(await t.withIdentity({ subject: 'other' }).query(ref<'query'>('uploads:list'), {})).toEqual([]);
  const result = await actor.mutation(ref<'mutation'>('uploads:requestEdit'), { uploadId: session.uploadId, instruction: 'Make this square', aspect: '1:1', confirmedOwnership: true, requestId: 'upload-request-5' });
  await expect(actor.mutation(ref<'mutation'>('uploads:remove'), { uploadId: session.uploadId })).rejects.toThrow('UPLOAD_IN_USE');
  await t.run(ctx => ctx.db.patch(result.jobId, { status: 'done' }));
  await actor.mutation(ref<'mutation'>('uploads:remove'), { uploadId: session.uploadId });
  expect(await actor.query(ref<'query'>('uploads:list'), {})).toEqual([]);
  expect(await t.run(ctx => ctx.db.system.get('_storage', storageId))).toBeNull();
});

test('scheduled probe dispatch uses the authenticated exact upload body', async () => {
  vi.stubEnv('DISPATCH_URL', 'https://dispatcher.test'); vi.stubEnv('DISPATCH_SECRET', 'dispatch-secret');
  const fetch = vi.fn(async () => new Response('{}', { status: 202 })); vi.stubGlobal('fetch', fetch);
  const { t, actor, session, storageId } = await setup();
  await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
  await t.action(ref<'action'>('uploads:dispatchProbe'), { uploadId: session.uploadId, generation: 1 });
  expect(fetch).toHaveBeenCalledWith('https://dispatcher.test/probe-upload', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer dispatch-secret' }), body: JSON.stringify({ uploadId: session.uploadId }),
  }));
  expect((await t.run(ctx => ctx.db.get(session.uploadId)))?.probeDispatchAttempts).toBe(1);
  await t.mutation(ref<'mutation'>('uploads:probeDispatchWatchdog'), { uploadId: session.uploadId, generation: 1, attempt: 1 });
  await t.action(ref<'action'>('uploads:dispatchProbe'), { uploadId: session.uploadId, generation: 1, attempt: 2 });
  await t.mutation(ref<'mutation'>('uploads:probeDispatchWatchdog'), { uploadId: session.uploadId, generation: 1, attempt: 2 });
  await t.action(ref<'action'>('uploads:dispatchProbe'), { uploadId: session.uploadId, generation: 1, attempt: 3 });
  await t.mutation(ref<'mutation'>('uploads:probeDispatchWatchdog'), { uploadId: session.uploadId, generation: 1, attempt: 3 });
  expect((await t.run(ctx => ctx.db.get(session.uploadId)))?.status).toBe('failed');
  expect(await actor.query(ref<'query'>('uploads:probeStatuses'), {})).toEqual([{
    _id: session.uploadId, name: 'video.mp4', size: 5, status: 'failed',
  }]);
  await actor.mutation(ref<'mutation'>('uploads:remove'), { uploadId: session.uploadId });
  expect(await actor.query(ref<'query'>('uploads:probeStatuses'), {})).toEqual([]);
});

test('claimed probe failure starts a new dispatch generation that cannot hang behind stale attempts', async () => {
  vi.stubEnv('WORKER_SECRET', 'upload-probe-secret');
  vi.stubEnv('DISPATCH_URL', 'https://dispatcher.test'); vi.stubEnv('DISPATCH_SECRET', 'dispatch-secret');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 202 })));
  const { t, actor, session, storageId } = await setup();
  await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
  await t.action(ref<'action'>('uploads:dispatchProbe'), { uploadId: session.uploadId, generation: 1, attempt: 1 });
  await t.mutation(ref<'mutation'>('uploads:probeDispatchWatchdog'), { uploadId: session.uploadId, generation: 1, attempt: 1 });
  await t.action(ref<'action'>('uploads:dispatchProbe'), { uploadId: session.uploadId, generation: 1, attempt: 2 });
  const claim = await t.mutation(ref<'mutation'>('uploads:claimProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, workerId: 'probe-worker-1' }) as any;
  expect((await t.run(ctx => ctx.db.get(session.uploadId)))?.status).toBe('probing');
  expect(await t.mutation(ref<'mutation'>('uploads:probeDispatchWatchdog'), { uploadId: session.uploadId, generation: 1, attempt: 2 })).toBe(false);
  await expect(t.mutation(ref<'mutation'>('uploads:failProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, probeToken: claim.probeToken, storageId })).resolves.toBe(true);
  expect(await t.run(ctx => ctx.db.get(session.uploadId))).toMatchObject({ status: 'preparing', probeDispatchGeneration: 2, probeDispatchAttempts: 0 });
  for (const attempt of [1, 2, 3]) {
    await t.action(ref<'action'>('uploads:dispatchProbe'), { uploadId: session.uploadId, generation: 2, attempt });
    await t.mutation(ref<'mutation'>('uploads:probeDispatchWatchdog'), { uploadId: session.uploadId, generation: 2, attempt });
  }
  expect((await t.run(ctx => ctx.db.get(session.uploadId)))?.status).toBe('failed');
});

test('probe claims and completion are secret gated, fenced, bounded, retryable, and idempotent', async () => {
  vi.stubEnv('WORKER_SECRET', 'upload-probe-secret');
  const { t, actor, session, storageId } = await setup();
  await expect(actor.mutation(ref<'mutation'>('uploads:begin'), {
    name: 'client.mp4', contentType: 'video/mp4', size: 5, mediaDurationMs: 1_000,
  } as never)).rejects.toThrow();
  await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
  await expect(t.mutation(ref<'mutation'>('uploads:claimProbe'), { workerSecret: 'wrong', uploadId: session.uploadId, workerId: 'probe-worker-1' })).rejects.toThrow('UNAUTHORIZED_WORKER');
  const claim = await t.mutation(ref<'mutation'>('uploads:claimProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, workerId: 'probe-worker-1' }) as any;
  expect(claim).toMatchObject({ uploadId: session.uploadId, userId: 'u1', storageId, size: 5 });
  expect(claim.storageUrl).toMatch(/^https?:|^blob:/);
  await expect(t.mutation(ref<'mutation'>('uploads:claimProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, workerId: 'probe-worker-2' })).resolves.toBeNull();
  const complete = (patch: Record<string, unknown> = {}) => t.mutation(ref<'mutation'>('uploads:completeProbe'), {
    workerSecret: 'upload-probe-secret', uploadId: session.uploadId, probeToken: claim.probeToken, storageId,
    mediaDurationMs: 1_000, mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: false, ...patch,
  });
  for (const patch of [
    { mediaDurationMs: 99 }, { mediaDurationMs: 300_001 }, { mediaDurationMs: 1.5 },
    { mediaWidth: 0 }, { mediaWidth: 16_385 }, { mediaHeight: 0 }, { mediaHeight: 16_385 },
  ]) await expect(complete(patch)).rejects.toThrow('INVALID_MEDIA_METADATA');
  await expect(complete({ probeToken: 'stale-token' })).resolves.toBe(false);
  const otherStorage = await t.run(ctx => ctx.storage.store(new Blob(['other'])));
  await expect(complete({ storageId: otherStorage })).resolves.toBe(false);
  await expect(complete()).resolves.toBe(true);
  await expect(complete()).resolves.toBe(true);
  await expect(complete({ mediaDurationMs: 1_001 })).rejects.toThrow('MEDIA_METADATA_CONFLICT');
  const replacement = await t.run(ctx => ctx.storage.store(new Blob(['hello'])));
  await t.run(ctx => ctx.db.patch(session.uploadId, { storageId: replacement }));
  await expect(complete()).resolves.toBe(false);
  expect(await t.run(ctx => ctx.db.get(session.uploadId))).toMatchObject({ status: 'ready', mediaDurationMs: 1_000 });
  expect((await t.run(ctx => ctx.db.query('genJobs').collect()))).toEqual([]);
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('probe failure issues a fresh lease and stale or expired tokens cannot complete', async () => {
  vi.stubEnv('WORKER_SECRET', 'upload-probe-secret');
  const { t, actor, session, storageId } = await setup();
  await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
  const claim = await t.mutation(ref<'mutation'>('uploads:claimProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, workerId: 'probe-worker-1' }) as any;
  await expect(t.mutation(ref<'mutation'>('uploads:failProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, probeToken: claim.probeToken, storageId })).resolves.toBe(true);
  expect((await t.run(ctx => ctx.db.get(session.uploadId)))?.status).toBe('preparing');
  const retry = await t.mutation(ref<'mutation'>('uploads:claimProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, workerId: 'probe-worker-2' }) as any;
  expect(retry.probeToken).not.toBe(claim.probeToken);
  await expect(t.mutation(ref<'mutation'>('uploads:completeProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, probeToken: claim.probeToken, storageId, mediaDurationMs: 100, mediaWidth: 1, mediaHeight: 1, mediaHasAudio: false })).resolves.toBe(false);
  vi.useFakeTimers(); vi.setSystemTime(retry.probeExpiresAt + 1);
  await expect(t.mutation(ref<'mutation'>('uploads:completeProbe'), { workerSecret: 'upload-probe-secret', uploadId: session.uploadId, probeToken: retry.probeToken, storageId, mediaDurationMs: 100, mediaWidth: 1, mediaHeight: 1, mediaHasAudio: false })).resolves.toBe(false);
  await expect(t.mutation(ref<'mutation'>('uploads:recoverProbe'), { uploadId: session.uploadId, probeToken: retry.probeToken, storageId })).resolves.toBe(true);
  expect(await t.run(ctx => ctx.db.get(session.uploadId))).toMatchObject({ status: 'preparing', probeDispatchGeneration: 3, probeDispatchAttempts: 0 });
});

test('legacy ready video stays unusable until bounded trusted re-probe completes', async () => {
  vi.stubEnv('WORKER_SECRET', 'upload-probe-secret');
  const { t, actor, storageId } = await setup();
  const legacyId = await t.run(ctx => ctx.db.insert('uploads', {
    userId: 'u1', name: 'legacy.mp4', size: 5, contentType: 'video/mp4', kind: 'video', status: 'ready', storageId, createdAt: 1,
  }));
  expect(await actor.query(ref<'query'>('uploads:list'), {})).toEqual([]);
  await expect(actor.mutation(ref<'mutation'>('uploads:requestEdit'), { uploadId: legacyId, instruction: 'Make this square', aspect: '1:1', confirmedOwnership: true, requestId: 'legacy-unprobed' })).rejects.toThrow('UPLOAD_NOT_READY');
  expect(await t.mutation(ref<'mutation'>('uploads:reprobeLegacyReady'), { cursor: null })).toMatchObject({ moved: 1, isDone: true });
  expect((await t.run(ctx => ctx.db.get(legacyId)))?.status).toBe('preparing');
  expect(await actor.query(ref<'query'>('uploads:probeStatuses'), {})).toContainEqual(expect.objectContaining({ _id: legacyId, status: 'preparing' }));
  await completeProbe(t, legacyId, storageId);
  expect(await actor.query(ref<'query'>('uploads:list'), {})).toContainEqual(expect.objectContaining({ _id: legacyId }));
});

test('retained project revisions block upload removal while unrelated uploads remain removable', async () => {
  const { t, actor, session, storageId } = await setup();
  await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
  await completeProbe(t, session.uploadId, storageId);
  const unrelated = await actor.mutation(ref<'mutation'>('uploads:begin'), { name: 'other.mp4', contentType: 'video/mp4', size: 5 });
  const unrelatedStorage = await t.run(ctx => ctx.storage.store(new Blob(['other'], { type: 'video/mp4' })));
  await t.run(ctx => (ctx.db as any).patch(unrelatedStorage, { contentType: 'video/mp4' }));
  await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: unrelated.uploadId, storageId: unrelatedStorage });
  await completeProbe(t, unrelated.uploadId, unrelatedStorage);
  await t.run(async ctx => {
    const jobId = await ctx.db.insert('genJobs', { userId: 'u1', mode: 'generate', prompt: 'source', status: 'done', storageKey: 'videos/source.mp4', createdAt: 1 });
    const projectId = await ctx.db.insert('projects', { userId: 'u1', sourceJobId: jobId, name: 'Project', createdAt: 1, updatedAt: 1 });
    const revisionId = await ctx.db.insert('projectRevisions', {
      userId: 'u1', projectId, revision: 1, requestId: 'retained-source', createdAt: 1,
      timeline: { version: 1, aspect: '16:9', durationMs: 1_000, video: [{ id: 'clip', source: { kind: 'upload', uploadId: session.uploadId }, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 0, fit: 'crop', muted: false }], transitions: [], text: [], graphics: [] },
    });
    await ctx.db.insert('projectSources', { userId: 'u1', projectId, revisionId, kind: 'upload', uploadId: session.uploadId });
  });
  await expect(actor.mutation(ref<'mutation'>('uploads:remove'), { uploadId: session.uploadId })).rejects.toThrow('UPLOAD_IN_USE');
  await expect(actor.mutation(ref<'mutation'>('uploads:remove'), { uploadId: unrelated.uploadId })).resolves.toBeNull();
  expect(await t.run(async ctx => (await ctx.storage.get(storageId)) !== null)).toBe(true);
  expect(await t.run(async ctx => (await ctx.storage.get(unrelatedStorage)) === null)).toBe(true);
});

test('expiry processes bounded pending sessions and preserves ready sources used by jobs', async () => {
 const { t, actor, session, storageId } = await setup();
 await actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: session.uploadId, storageId });
 await completeProbe(t, session.uploadId, storageId);
 const { jobId } = await actor.mutation(ref<'mutation'>('uploads:requestEdit'), { uploadId: session.uploadId, instruction: 'Make this square', aspect: '1:1', confirmedOwnership: true, requestId: 'expiry-source-job' });
 const now = Date.now();
 const ids = await t.run(async ctx => {
  const ids = [];
  for (let i = 0; i < 105; i++) ids.push(await ctx.db.insert('uploads', { userId: 'u1', name: 'abandoned.mp4', size: 5, contentType: 'video/mp4', status: 'pending', createdAt: now - 7200000 }));
  return ids;
 });
 const fresh = await t.run(ctx => ctx.db.insert('uploads', { userId: 'u1', name: 'fresh.mp4', size: 5, contentType: 'video/mp4', status: 'pending', createdAt: now }));
 expect(await t.mutation(ref<'mutation'>('uploads:expirePending'), {})).toBe(100);
 expect(await t.mutation(ref<'mutation'>('uploads:expirePending'), {})).toBe(5);
 expect(await t.mutation(ref<'mutation'>('uploads:expirePending'), {})).toBe(0);
 expect((await t.run(ctx => ctx.db.get(fresh)))?.status).toBe('pending');
 expect((await t.run(ctx => ctx.db.get(session.uploadId)))?.status).toBe('ready');
 expect(await t.run(async ctx => (await ctx.storage.get(storageId)) !== null)).toBe(true);
 expect((await t.run(ctx => ctx.db.get(jobId)))?.sourceStorageId).toBe(storageId);
 await expect(actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId: ids[0], storageId })).rejects.toThrow('UPLOAD_EXPIRED');
});
