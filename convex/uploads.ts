import { brandSelection } from './brandValues';
import { transformsValidator, normalizeTransforms } from './transforms';
import { captionStyleValidator } from './captions';
import { mutationGeneric as mutation, internalMutationGeneric as internalMutation, internalActionGeneric as internalAction, makeFunctionReference as ref, queryGeneric as query } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { owner, enqueue, aspectValidator, checkWorker, dispatcher } from './jobs';
import { musicSelection } from './music';
import { hasTrustedMediaMetadata, mediaMetadataArgs, validateMediaMetadata } from './mediaMetadata';
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'];
const kindValidator = v.optional(v.union(v.literal('video'), v.literal('audio')));
const maxBytes = (kind?: string) => kind === 'audio' ? 20 * 1024 * 1024 : MAX_UPLOAD_BYTES;
const PROBE_LEASE_MS = 90_000;
const MAX_PROBE_ATTEMPTS = 3;
const PROBE_DISPATCH_GRACE_MS = 90_000;
const dispatchProbeRef = ref<'action'>('uploads:dispatchProbe');
export const expirePending = internalMutation({ args: {}, handler: async (ctx) => {
  const expired = await ctx.db.query('uploads').withIndex('by_status_created', (q: any) => q.eq('status', 'pending').lt('createdAt', Date.now() - 3600000)).take(100);
  for (const upload of expired) await ctx.db.patch(upload._id, { status: 'expired' });
  return expired.length;
} });
export const begin = mutation({
  args: { name: v.string(), size: v.number(), contentType: v.string(), kind: kindValidator, confirmedOwnership: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await owner(ctx);
    if (args.kind === 'audio' && !args.confirmedOwnership) throw new ConvexError('CONFIRM_AUDIO_RIGHTS');
    if (!args.name.trim() || args.name.length > 200 || !Number.isSafeInteger(args.size) || args.size < 1 || args.size > maxBytes(args.kind) || !(args.kind === 'audio' ? AUDIO_TYPES : TYPES).includes(args.contentType)) throw new ConvexError('INVALID_UPLOAD');
    const [recent, ready] = await Promise.all([
      ctx.db.query('uploads').withIndex('by_user', (q: any) => q.eq('userId', user.tokenIdentifier).gt('_creationTime', Date.now() - 3600000)).take(5),
      ctx.db.query('uploads').withIndex('by_user_status', (q: any) => q.eq('userId', user.tokenIdentifier).eq('status', 'ready')).take(10),
    ]);
    if (recent.length >= 5 || ready.length >= 10) throw new ConvexError('UPLOAD_LIMIT');
    const uploadId = await ctx.db.insert('uploads', { userId: user.tokenIdentifier, name: args.name, size: args.size, contentType: args.contentType, kind: args.kind ?? 'video', confirmedOwnership: args.kind === 'audio' ? true : undefined, status: 'pending', createdAt: Date.now() });
    return { uploadId, url: await ctx.storage.generateUploadUrl() };
  },
});
export const finish = mutation({
  args: { uploadId: v.id('uploads'), storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    const user = await owner(ctx), upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.userId !== user.tokenIdentifier) throw new ConvexError('UPLOAD_NOT_FOUND');
    if (['preparing', 'probing', 'ready'].includes(upload.status) && upload.storageId === args.storageId) return { uploadId: upload._id };
    if (upload.status !== 'pending' || upload.createdAt < Date.now() - 3600000) throw new ConvexError('UPLOAD_EXPIRED');
    const ready = await ctx.db.query('uploads').withIndex('by_user_status', (q: any) => q.eq('userId', user.tokenIdentifier).eq('status', 'ready')).take(10);
    if (ready.length >= 10) throw new ConvexError('UPLOAD_LIMIT');
    const existing = await ctx.db.query('uploads').withIndex('by_storage', q => q.eq('storageId', args.storageId)).first();
    if (existing) throw new ConvexError('FILE_ALREADY_ATTACHED');
    const metadata = await ctx.db.system.get('_storage', args.storageId);
    if (!metadata || metadata.size !== upload.size || metadata.size > maxBytes(upload.kind) || metadata.contentType !== upload.contentType || metadata._creationTime < upload.createdAt) throw new ConvexError('INVALID_UPLOAD');
    const isAudio = upload.kind === 'audio';
    await ctx.db.patch(upload._id, { status: isAudio ? 'ready' : 'preparing', storageId: args.storageId, probeAttempts: isAudio ? undefined : 0, probeDispatchAttempts: isAudio ? undefined : 0, probeDispatchGeneration: isAudio ? undefined : 1 });
    if (!isAudio) await ctx.scheduler.runAfter(0, dispatchProbeRef, { uploadId: upload._id, generation: 1 });
    return { uploadId: upload._id };
  },
});

export const dispatchProbe = internalAction({
  args: { uploadId: v.id('uploads'), generation: v.number(), attempt: v.optional(v.number()) },
  handler: async (ctx, { uploadId, generation, attempt = 1 }) => {
    let accepted = false;
    try { await dispatcher('probe-upload', { uploadId }); accepted = true; }
    catch { console.error('Upload probe dispatch was not confirmed', uploadId, attempt); }
    await ctx.runMutation(ref<'mutation'>('uploads:finishProbeDispatch'), { uploadId, generation, attempt, accepted });
  },
});

export const finishProbeDispatch = internalMutation({
  args: { uploadId: v.id('uploads'), generation: v.number(), attempt: v.number(), accepted: v.boolean() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.kind === 'audio' || upload.status !== 'preparing' || upload.probeDispatchGeneration !== args.generation || args.attempt < (upload.probeDispatchAttempts ?? 0)) return false;
    await ctx.db.patch(upload._id, { probeDispatchAttempts: args.attempt });
    if (args.accepted) {
      await ctx.scheduler.runAfter(PROBE_DISPATCH_GRACE_MS, ref<'mutation'>('uploads:probeDispatchWatchdog'), { uploadId: upload._id, generation: args.generation, attempt: args.attempt });
    } else if (args.attempt < MAX_PROBE_ATTEMPTS) {
      await ctx.scheduler.runAfter(30_000, dispatchProbeRef, { uploadId: upload._id, generation: args.generation, attempt: args.attempt + 1 });
    } else {
      await ctx.db.patch(upload._id, { status: 'failed', probeError: 'Media inspection could not start.' });
    }
    return true;
  },
});

export const probeDispatchWatchdog = internalMutation({
  args: { uploadId: v.id('uploads'), generation: v.number(), attempt: v.number() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status !== 'preparing' || upload.probeDispatchGeneration !== args.generation || upload.probeDispatchAttempts !== args.attempt) return false;
    if (args.attempt >= MAX_PROBE_ATTEMPTS) {
      await ctx.db.patch(upload._id, { status: 'failed', probeError: 'Media inspection did not start.' });
    } else {
      await ctx.scheduler.runAfter(0, dispatchProbeRef, { uploadId: upload._id, generation: args.generation, attempt: args.attempt + 1 });
    }
    return true;
  },
});

export const claimProbe = mutation({
  args: { workerSecret: v.string(), uploadId: v.id('uploads'), workerId: v.string() },
  handler: async (ctx, args) => {
    checkWorker(args.workerSecret);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(args.workerId)) throw new ConvexError('INVALID_WORKER_ID');
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.kind === 'audio' || !upload.storageId || !['preparing', 'probing'].includes(upload.status)) return null;
    const now = Date.now();
    if (upload.status === 'probing' && (upload.probeExpiresAt ?? 0) > now) return null;
    const attempt = (upload.probeAttempts ?? 0) + 1;
    if (attempt > MAX_PROBE_ATTEMPTS) { await ctx.db.patch(upload._id, { status: 'failed', probeError: 'Media inspection failed.' }); return null; }
    const token = `${args.workerId}:${attempt}:${now}`;
    const expiresAt = now + PROBE_LEASE_MS;
    await ctx.db.patch(upload._id, { status: 'probing', probeAttempts: attempt, probeToken: token, probeStorageId: upload.storageId, probeExpiresAt: expiresAt, probeError: undefined });
    await ctx.scheduler.runAfter(PROBE_LEASE_MS, ref<'mutation'>('uploads:recoverProbe'), { uploadId: upload._id, probeToken: token, storageId: upload.storageId });
    const storageUrl = await ctx.storage.getUrl(upload.storageId);
    if (!storageUrl) throw new ConvexError('UPLOAD_STORAGE_MISSING');
    return { uploadId: upload._id, userId: upload.userId, storageId: upload.storageId, storageUrl, size: upload.size, probeToken: token, probeExpiresAt: expiresAt };
  },
});

export const completeProbe = mutation({
  args: { workerSecret: v.string(), uploadId: v.id('uploads'), probeToken: v.string(), storageId: v.id('_storage'), ...mediaMetadataArgs },
  handler: async (ctx, args) => {
    checkWorker(args.workerSecret);
    const metadata = validateMediaMetadata(args);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.kind === 'audio' || upload.storageId !== args.storageId || upload.probeStorageId !== args.storageId || upload.probeToken !== args.probeToken) return false;
    const prior = { mediaDurationMs: upload.mediaDurationMs, mediaWidth: upload.mediaWidth, mediaHeight: upload.mediaHeight, mediaHasAudio: upload.mediaHasAudio };
    const hasPrior = Object.values(prior).some(value => value !== undefined);
    if (upload.status === 'ready') {
      if (Object.entries(metadata).every(([key, value]) => prior[key as keyof typeof prior] === value)) return true;
      throw new ConvexError('MEDIA_METADATA_CONFLICT');
    }
    if (upload.status !== 'probing' || (upload.probeExpiresAt ?? 0) <= Date.now()) return false;
    if (hasPrior) throw new ConvexError('MEDIA_METADATA_CONFLICT');
    const ready = await ctx.db.query('uploads').withIndex('by_user_status', (q: any) => q.eq('userId', upload.userId).eq('status', 'ready')).take(10);
    if (ready.length >= 10) throw new ConvexError('UPLOAD_LIMIT');
    await ctx.db.patch(upload._id, { ...metadata, status: 'ready', probeExpiresAt: undefined, probeError: undefined });
    return true;
  },
});

export const failProbe = mutation({
  args: { workerSecret: v.string(), uploadId: v.id('uploads'), probeToken: v.string(), storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    checkWorker(args.workerSecret);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status !== 'probing' || upload.storageId !== args.storageId || upload.probeStorageId !== args.storageId || upload.probeToken !== args.probeToken || (upload.probeExpiresAt ?? 0) <= Date.now()) return false;
    const retry = (upload.probeAttempts ?? 0) < MAX_PROBE_ATTEMPTS;
    const generation = (upload.probeDispatchGeneration ?? 0) + 1;
    await ctx.db.patch(upload._id, { status: retry ? 'preparing' : 'failed', probeToken: undefined, probeStorageId: undefined, probeExpiresAt: undefined, probeError: 'Media inspection failed.', ...(retry ? { probeDispatchGeneration: generation, probeDispatchAttempts: 0 } : {}) });
    if (retry) await ctx.scheduler.runAfter(1_000, dispatchProbeRef, { uploadId: upload._id, generation });
    return true;
  },
});

export const recoverProbe = internalMutation({
  args: { uploadId: v.id('uploads'), probeToken: v.string(), storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status !== 'probing' || upload.probeToken !== args.probeToken || upload.storageId !== args.storageId || upload.probeStorageId !== args.storageId || (upload.probeExpiresAt ?? 0) > Date.now()) return false;
    const retry = (upload.probeAttempts ?? 0) < MAX_PROBE_ATTEMPTS;
    const generation = (upload.probeDispatchGeneration ?? 0) + 1;
    await ctx.db.patch(upload._id, { status: retry ? 'preparing' : 'failed', probeToken: undefined, probeStorageId: undefined, probeExpiresAt: undefined, probeError: 'Media inspection timed out.', ...(retry ? { probeDispatchGeneration: generation, probeDispatchAttempts: 0 } : {}) });
    if (retry) await ctx.scheduler.runAfter(0, dispatchProbeRef, { uploadId: upload._id, generation });
    return true;
  },
});

export const requestEdit = mutation({
  args: { brandKit: v.optional(brandSelection), captionStyle: v.optional(captionStyleValidator), uploadId: v.id('uploads'), transforms: v.optional(transformsValidator), instruction: v.optional(v.string()), requestId: v.string(), aspect: aspectValidator, confirmedOwnership: v.boolean(), music: v.optional(musicSelection) },
  handler: async (ctx, args) => {
    const user = await owner(ctx), upload = await ctx.db.get(args.uploadId);
    if (!args.confirmedOwnership) throw new ConvexError('CONFIRM_VIDEO_RIGHTS');
    if (!upload || upload.userId !== user.tokenIdentifier || upload.status !== 'ready' || upload.kind === 'audio' || !upload.storageId || !hasTrustedMediaMetadata(upload)) throw new ConvexError('UPLOAD_NOT_READY');
    const transforms = normalizeTransforms(args.transforms, args.aspect, args.instruction);
    if (transforms && args.aspect !== transforms.aspect) throw new ConvexError('AMBIGUOUS_EDIT');
    return enqueue(ctx, user, { brandKit: args.brandKit, transforms, mode: 'edit', captionStyle: args.captionStyle, prompt: transforms ? 'Apply Studio transforms' : args.instruction ?? '', requestId: args.requestId, aspect: args.aspect, music: args.music, sourceStorageId: upload.storageId });
  },
});

export const list = query({ args: { kind: kindValidator }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  const uploads = await ctx.db.query('uploads').withIndex('by_user_status', (q: any) => q.eq('userId', identity.subject).eq('status', 'ready')).order('desc').take(10);
  return uploads.filter(u => (u.kind ?? 'video') === (args.kind ?? 'video') && ((u.kind ?? 'video') === 'audio' || hasTrustedMediaMetadata(u))).map(u => ({ _id: u._id, name: u.name, size: u.size }));
} });
export const probeStatuses = query({ args: {}, handler: async ctx => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  const rows = await ctx.db.query('uploads').withIndex('by_user', (q: any) => q.eq('userId', identity.subject)).order('desc').take(50);
  return rows.filter(row => row.kind !== 'audio' && ['preparing', 'probing', 'failed'].includes(row.status)).slice(0, 10)
    .map(row => ({ _id: row._id, name: row.name, size: row.size, status: row.status }));
} });

export const reprobeLegacyReady = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('uploads').withIndex('by_status_created', (q: any) => q.eq('status', 'ready')).paginate({ cursor, numItems: 100 });
    let moved = 0;
    for (const upload of page.page) {
      if ((upload.kind ?? 'video') === 'audio' || hasTrustedMediaMetadata(upload)) continue;
      if (!upload.storageId) {
        await ctx.db.patch(upload._id, { status: 'failed', probeError: 'Upload storage is missing.' });
      } else {
        const generation = (upload.probeDispatchGeneration ?? 0) + 1;
        await ctx.db.patch(upload._id, { status: 'preparing', probeAttempts: 0, probeDispatchAttempts: 0, probeDispatchGeneration: generation, probeError: undefined });
        await ctx.scheduler.runAfter(0, dispatchProbeRef, { uploadId: upload._id, generation });
      }
      moved++;
    }
    return { moved, cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone };
  },
});
export const remove = mutation({ args: { uploadId: v.id('uploads') }, handler: async (ctx, args) => {
  const user = await owner(ctx), upload = await ctx.db.get(args.uploadId);
  if (!upload || upload.userId !== user.tokenIdentifier) throw new ConvexError('UPLOAD_NOT_FOUND');
  if (upload.status === 'deleted') return;
  const retained = await ctx.db.query('projectSources').withIndex('by_upload', q => q.eq('uploadId', upload._id)).first();
  if (retained) throw new ConvexError('UPLOAD_IN_USE');
  if (upload.storageId) {
    const active = await Promise.all(['queued', 'dispatched', 'processing'].map(status => ctx.db.query('genJobs').withIndex('by_source_status', (q: any) => q.eq('sourceStorageId', upload.storageId).eq('status', status)).first()));
    const musicActive = await Promise.all(['queued', 'dispatched', 'processing'].map(status => ctx.db.query('genJobs').withIndex('by_music_status', (q: any) => q.eq('musicStorageId', upload.storageId).eq('status', status)).first()));
    if (active.some(Boolean) || musicActive.some(Boolean)) throw new ConvexError('UPLOAD_IN_USE');
    await ctx.storage.delete(upload.storageId);
  }
  await ctx.db.patch(upload._id, { status: 'deleted' });
} });
