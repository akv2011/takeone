declare const process: { env: Record<string, string | undefined> };
import { internalMutationGeneric as internalMutation, internalQueryGeneric as internalQuery } from 'convex/server';
export const GRACE_MS = 24 * 60 * 60 * 1000;
export const PAGE_SIZE = 100;
const NAME = 'upload-orphans';
function mode() {
  const value = process.env.UPLOAD_CLEANUP_MODE ?? 'audit';
  if (!['off', 'audit', 'delete'].includes(value)) throw new Error('Invalid UPLOAD_CLEANUP_MODE');
  return value;
}

export const run = internalMutation({ args: {}, handler: async ctx => {
  const selectedMode = mode();
  if (selectedMode === 'off') return { mode: selectedMode, scanned: 0, candidates: 0, deleted: 0 };
  const prior = await ctx.db.query('storageSweeps').withIndex('by_name', q => q.eq('name', NAME)).unique();
  // A mode change starts a fresh sweep, so a preceding audit cannot skip
  // candidates when deletion is enabled.
  const continuing = prior?.cursor !== null && prior?.cursor !== undefined && prior.mode === selectedMode;
  const cutoff = continuing ? prior.cutoff : Date.now() - GRACE_MS;
  const result = await ctx.db.system.query('_storage').withIndex('by_creation_time', q => q.lt('_creationTime', cutoff))
    .order('asc').paginate({ cursor: continuing ? prior.cursor : null, numItems: PAGE_SIZE });
  let candidates = 0, deleted = 0, protectedCount = 0;
  for (const file of result.page) {
    const [upload, source, music] = await Promise.all([
      ctx.db.query('uploads').withIndex('by_storage', q => q.eq('storageId', file._id)).first(),
      ctx.db.query('genJobs').withIndex('by_source_storage', q => q.eq('sourceStorageId', file._id)).first(),
      ctx.db.query('genJobs').withIndex('by_music_status', q => q.eq('musicStorageId', file._id)).first(),
    ]);
    const retained = upload
      ? await ctx.db.query('projectSources').withIndex('by_upload', q => q.eq('uploadId', upload._id)).first()
      : null;
    if ((upload && upload.status !== 'deleted') || retained || source || music) { protectedCount++; continue; }
    candidates++;
    if (selectedMode === 'delete') { await ctx.storage.delete(file._id); deleted++; }
  }
  const state = {
    name: NAME, mode: selectedMode, cursor: result.isDone ? null : result.continueCursor, cutoff,
    scanned: (continuing ? prior.scanned : 0) + result.page.length,
    candidates: (continuing ? prior.candidates : 0) + candidates,
    deleted: (continuing ? prior.deleted : 0) + deleted,
    protected: (continuing ? prior.protected : 0) + protectedCount,
    totalScanned: (prior?.totalScanned ?? 0) + result.page.length,
    totalDeleted: (prior?.totalDeleted ?? 0) + deleted,
    lastRunAt: Date.now(), lastCompletedAt: result.isDone ? Date.now() : prior?.lastCompletedAt,
  };
  if (prior) await ctx.db.patch(prior._id, state);
  else await ctx.db.insert('storageSweeps', state);
  return { mode: selectedMode, scanned: result.page.length, candidates, deleted, protected: protectedCount, sweepComplete: result.isDone };
} });

export const status = internalQuery({ args: {}, handler: async ctx => {
  const state = await ctx.db.query('storageSweeps').withIndex('by_name', q => q.eq('name', NAME)).unique();
  if (!state) return { configuredMode: mode(), lastRunAt: null };
  const { cursor, _id, _creationTime, name, ...counts } = state;
  void _id; void _creationTime; void name;
  return { configuredMode: mode(), sweepInProgress: cursor !== null, ...counts };
} });
