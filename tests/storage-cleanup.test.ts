import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import { run, status, GRACE_MS, PAGE_SIZE } from '../convex/storageCleanup';
const modules = import.meta.glob('../convex/**/*.ts');
const cleanup = (t: ReturnType<typeof convexTest>) => t.mutation(ref<'mutation'>('storageCleanup:run'), {});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T10:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function blob(t: ReturnType<typeof convexTest>) { return t.run(ctx => ctx.storage.store(new Blob(['file'], { type: 'audio/mpeg' }))); }
function age() { vi.setSystemTime(Date.now() + GRACE_MS + 1); }
test('cleanup and status are registered as internal-only functions', () => {
 expect(run.isInternal).toBe(true); expect(status.isInternal).toBe(true);
});
test('audit preserves candidates, delete removes them, and repeat deletion is harmless', async () => {
 const t = convexTest(schema, modules), id = await blob(t); age();
 expect(await cleanup(t)).toMatchObject({ mode: 'audit', scanned: 1, candidates: 1, deleted: 0 });
 expect(await t.run(async ctx => (await ctx.storage.get(id)) !== null)).toBe(true);
 vi.stubEnv('UPLOAD_CLEANUP_MODE', 'delete');
 expect(await cleanup(t)).toMatchObject({ scanned: 1, deleted: 1 });
 expect(await t.run(ctx => ctx.storage.get(id))).toBeNull();
 expect(await cleanup(t)).toMatchObject({ scanned: 0, deleted: 0 });
 const summary = await t.query(ref<'query'>('storageCleanup:status'), {});
 expect(summary).toMatchObject({ totalScanned: 2, totalDeleted: 1, sweepInProgress: false });
 expect(summary).not.toHaveProperty('cursor'); expect(summary).not.toHaveProperty('_id');
});
test('new files and the exact grace-period boundary remain intact', async () => {
 const t = convexTest(schema, modules), older = await blob(t);
 vi.stubEnv('UPLOAD_CLEANUP_MODE', 'delete');
 vi.setSystemTime(Date.now() + GRACE_MS);
 expect(await cleanup(t)).toMatchObject({ scanned: 0 });
 const fresh = await blob(t); vi.setSystemTime(Date.now() + 1);
 expect(await cleanup(t)).toMatchObject({ deleted: 1 });
 expect(await t.run(ctx => ctx.storage.get(older))).toBeNull();
 expect(await t.run(async ctx => (await ctx.storage.get(fresh)) !== null)).toBe(true);
});
test('all upload and job reference classes survive, including terminal legacy jobs', async () => {
 const t = convexTest(schema, modules);
 const saved = await blob(t), source = await blob(t), music = await blob(t);
 await t.run(async ctx => {
  await ctx.db.insert('uploads', { userId: 'u', name: 'saved.mp3', size: 4, contentType: 'audio/mpeg', status: 'ready', storageId: saved, createdAt: Date.now() });
  await ctx.db.insert('genJobs', { userId: 'u', mode: 'edit', prompt: 'old source', status: 'done', sourceStorageId: source, createdAt: Date.now() });
  await ctx.db.insert('genJobs', { userId: 'u', mode: 'edit', prompt: 'old music', status: 'failed', musicStorageId: music, createdAt: Date.now() });
 });
 age(); vi.stubEnv('UPLOAD_CLEANUP_MODE', 'delete');
 expect(await cleanup(t)).toMatchObject({ scanned: 3, protected: 3, deleted: 0 });
 for (const id of [saved, source, music]) expect(await t.run(async ctx => (await ctx.storage.get(id)) !== null)).toBe(true);
});
test('reference insertion after audit is checked again before deletion', async () => {
 const t = convexTest(schema, modules), id = await blob(t); age();
 expect(await cleanup(t)).toMatchObject({ candidates: 1 });
 await t.run(ctx => ctx.db.insert('uploads', { userId: 'u', name: 'restored.mp4', size: 4, contentType: 'video/mp4', status: 'ready', storageId: id, createdAt: Date.now() }));
 vi.stubEnv('UPLOAD_CLEANUP_MODE', 'delete');
 expect(await cleanup(t)).toMatchObject({ protected: 1, deleted: 0 });
});
test('retained project upload sources protect deleted-row storage while unrelated deleted rows do not', async () => {
 const t = convexTest(schema, modules), retained = await blob(t), unrelated = await blob(t);
 await t.run(async ctx => {
  const retainedUpload = await ctx.db.insert('uploads', { userId: 'u', name: 'retained.mp4', size: 4, contentType: 'video/mp4', status: 'deleted', storageId: retained, createdAt: 1 });
  await ctx.db.insert('uploads', { userId: 'u', name: 'unrelated.mp4', size: 4, contentType: 'video/mp4', status: 'deleted', storageId: unrelated, createdAt: 1 });
  const jobId = await ctx.db.insert('genJobs', { userId: 'u', mode: 'generate', prompt: 'source', status: 'done', storageKey: 'videos/source.mp4', createdAt: 1 });
  const projectId = await ctx.db.insert('projects', { userId: 'u', sourceJobId: jobId, name: 'Project', createdAt: 1, updatedAt: 1 });
  const revisionId = await ctx.db.insert('projectRevisions', {
   userId: 'u', projectId, revision: 1, requestId: 'cleanup-retained', createdAt: 1,
   timeline: { version: 1, aspect: '16:9', durationMs: 1_000, video: [{ id: 'clip', source: { kind: 'upload', uploadId: retainedUpload }, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 0, fit: 'crop', muted: false }], transitions: [], text: [], graphics: [] },
  });
  await ctx.db.insert('projectSources', { userId: 'u', projectId, revisionId, kind: 'upload', uploadId: retainedUpload });
 });
 age(); vi.stubEnv('UPLOAD_CLEANUP_MODE', 'delete');
 expect(await cleanup(t)).toMatchObject({ scanned: 2, protected: 1, deleted: 1 });
 expect(await t.run(async ctx => (await ctx.storage.get(retained)) !== null)).toBe(true);
 expect(await t.run(async ctx => (await ctx.storage.get(unrelated)) === null)).toBe(true);
});
test('bounded pages advance beyond protected old files and restart on mode change', async () => {
 const t = convexTest(schema, modules);
 for (let i = 0; i < PAGE_SIZE; i++) {
  const id = await blob(t);
  await t.run(ctx => ctx.db.insert('uploads', { userId: 'u', name: `${i}.mp4`, size: 4, contentType: 'video/mp4', status: 'ready', storageId: id, createdAt: Date.now() }));
  vi.setSystemTime(Date.now() + 1);
 }
 const orphan = await blob(t); age();
 expect(await cleanup(t)).toMatchObject({ scanned: PAGE_SIZE, protected: PAGE_SIZE, sweepComplete: false });
 vi.stubEnv('UPLOAD_CLEANUP_MODE', 'delete');
 expect(await cleanup(t)).toMatchObject({ scanned: PAGE_SIZE, protected: PAGE_SIZE, deleted: 0, sweepComplete: false });
 expect(await cleanup(t)).toMatchObject({ scanned: 1, deleted: 1, sweepComplete: true });
 expect(await t.run(ctx => ctx.storage.get(orphan))).toBeNull();
});
test('off does not scan or alter sweep state; invalid configuration fails closed', async () => {
 const t = convexTest(schema, modules), id = await blob(t); age();
 vi.stubEnv('UPLOAD_CLEANUP_MODE', 'off');
 expect(await cleanup(t)).toMatchObject({ mode: 'off', scanned: 0 });
 expect(await t.run(ctx => ctx.db.query('storageSweeps').collect())).toHaveLength(0);
 vi.stubEnv('UPLOAD_CLEANUP_MODE', 'typo');
 await expect(cleanup(t)).rejects.toThrow('Invalid UPLOAD_CLEANUP_MODE');
 expect(await t.run(async ctx => (await ctx.storage.get(id)) !== null)).toBe(true);
});

test('fresh upload finalization can overlap cleanup without losing its file or spending allowance', async () => {
 const t = convexTest(schema, modules), orphan = await blob(t); age();
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u', freeUsed: 0, credits: 0 }));
 const actor = t.withIdentity({ subject: 'u' });
 const { uploadId } = await actor.mutation(ref<'mutation'>('uploads:begin'), { name: 'new.mp4', contentType: 'video/mp4', size: 4 });
 const fresh = await blob(t);
 await t.run(ctx => (ctx.db as any).patch(fresh, { contentType: 'video/mp4' }));
 vi.stubEnv('UPLOAD_CLEANUP_MODE', 'delete');
 const [sweep] = await Promise.all([cleanup(t), actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId, storageId: fresh })]);
 expect(sweep).toMatchObject({ deleted: 1 });
 expect((await t.run(ctx => ctx.db.get(uploadId)))?.status).toBe('preparing');
 expect(await t.run(async ctx => (await ctx.storage.get(fresh)) !== null)).toBe(true);
 expect(await t.run(ctx => ctx.storage.get(orphan))).toBeNull();
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});
test.each([true, false])('expired sessions cannot finalize eligible orphan blobs, cleanup first=%s', async cleanupFirst => {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u', freeUsed: 0, credits: 0 }));
 const actor = t.withIdentity({ subject: 'u' });
 const { uploadId } = await actor.mutation(ref<'mutation'>('uploads:begin'), { name: 'old.mp4', contentType: 'video/mp4', size: 4 });
 const storageId = await blob(t); age(); vi.stubEnv('UPLOAD_CLEANUP_MODE', 'delete');
 if (cleanupFirst) await cleanup(t);
 await expect(actor.mutation(ref<'mutation'>('uploads:finish'), { uploadId, storageId })).rejects.toThrow('UPLOAD_EXPIRED');
 if (!cleanupFirst) await cleanup(t);
 expect(await t.run(ctx => ctx.storage.get(storageId))).toBeNull();
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});
