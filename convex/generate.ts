import { brandSelection } from './brandValues';
import { renderStages, renderStageValidator, finishProgress } from './renderProgress';
import { transformsValidator, normalizeTransforms } from './transforms';
import { captionStyleValidator, captionLanguageValidator, captionPositionValidator, captionFontValidator, captionArchiveSource, captionTransformSource, validCaptionTexts } from './captions';
declare const process: { env: Record<string, string | undefined> };
import { paginationOptsValidator, queryGeneric as query, internalQueryGeneric as internalQuery, mutationGeneric as mutation, actionGeneric as action, makeFunctionReference as ref } from 'convex/server';
import { musicSelection } from './music';
import { v, ConvexError } from 'convex/values';
import { renderingPaused, owner, enqueue, cancelQueuedJob, checkWorker, modeValidator, aspectValidator, LEASE_MS, wake, retryOrFail, dispatcher } from './jobs';
import { hasManagedVideoOutput, hasTrustedMediaMetadata, mediaMetadataArgs, validateMediaMetadata } from './mediaMetadata';
import { productCapabilities } from './capabilities';

export const requestGeneration = mutation({
  args: { brandKit: v.optional(brandSelection), captionStyle: v.optional(captionStyleValidator), captionLanguage: v.optional(captionLanguageValidator), generationKind: v.optional(v.union(v.literal('stock'), v.literal('ai'))), music: v.optional(musicSelection), mode: modeValidator, prompt: v.string(), requestId: v.string(), aspect: v.optional(aspectValidator), confirmedOwnership: v.optional(v.boolean()) },
  handler: async (ctx: any, args: any) => {
    const user = await owner(ctx);
    if (args.generationKind === 'ai' && (args.captionStyle !== undefined || args.captionLanguage !== undefined)) throw new ConvexError('AI_CAPTIONS_UNAVAILABLE');
    if (args.generationKind === 'ai' && (args.mode !== 'generate' || args.aspect === '1:1')) throw new ConvexError('AI_VIDEO_UNAVAILABLE');
    if (args.mode === 'edit') throw new ConvexError('SELECT_SOURCE_VIDEO');
    if (args.mode === 'clip' && (!args.confirmedOwnership || !/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(args.prompt))) throw new ConvexError('CONFIRM_VIDEO_RIGHTS');
    const { confirmedOwnership: _confirmed, ...input } = args;
    return enqueue(ctx, user, { ...input, aspect: args.aspect ?? '9:16' });
  },
});
export const requestEdit = mutation({
  args: { music: v.optional(musicSelection), sourceJobId: v.id('genJobs'), transforms: v.optional(transformsValidator), instruction: v.optional(v.string()), requestId: v.string(), aspect: v.optional(aspectValidator) },
  handler: async (ctx: any, args: any) => {
    const user = await owner(ctx);
    const source = await ctx.db.get(args.sourceJobId);
    if (!source || source.userId !== user.tokenIdentifier || source.status !== 'done' || !source.storageKey) throw new ConvexError('SOURCE_UNAVAILABLE');
    const transforms = normalizeTransforms(args.transforms, args.aspect ?? source.aspect ?? '9:16', args.instruction);
    if (args.aspect && transforms && args.aspect !== transforms.aspect) throw new ConvexError('AMBIGUOUS_EDIT');
    const instruction = args.instruction ?? '';
    if (captionArchiveSource(source) && /\b(?:captions?|subtitles?|subs|meme|karaoke)\b/i.test(instruction)) throw new ConvexError('USE_CAPTION_CONTROLS');
    return enqueue(ctx, user, { brand: captionArchiveSource(source) ? source.brand : undefined, mode: 'edit', parentJobId: source._id, rootJobId: source.rootJobId ?? source._id, music: args.music, transforms, prompt: transforms ? 'Apply Studio transforms' : instruction, requestId: args.requestId, sourceStorageKey: source.storageKey, ...captionTransformSource(source), retainedMusic: source.music ?? source.retainedMusic, aspect: transforms?.aspect ?? args.aspect ?? (/\b(?:square|1:1)\b/i.test(instruction) ? '1:1' : /\b(?:landscape|16:9)\b/i.test(instruction) ? '16:9' : /\b(?:vertical|9:16)\b/i.test(instruction) ? '9:16' : source.aspect ?? '9:16') });
  },
});
export const requestCaptionEdit = mutation({
  args: { sourceJobId: v.id('genJobs'), captionPosition: v.optional(captionPositionValidator), captionFont: v.optional(captionFontValidator), captionTexts: v.optional(v.array(v.string())), captionStyle: captionStyleValidator, requestId: v.string() },
  handler: async (ctx: any, args: any) => {
    const user = await owner(ctx), source = await ctx.db.get(args.sourceJobId);
    if (!source || source.userId !== user.tokenIdentifier || source.status !== 'done' || !source.cleanStorageKey || !source.captionStorageKey) throw new ConvexError('CAPTION_SOURCE_UNAVAILABLE');
    if (args.captionTexts !== undefined && !validCaptionTexts(args.captionTexts)) throw new ConvexError('INVALID_CAPTION_TEXT');
    const archive = captionArchiveSource(source);
    if (!archive) throw new ConvexError('CAPTION_SOURCE_UNAVAILABLE');
    return enqueue(ctx, user, { brand: source.brand, captionFont: args.captionFont ?? source.captionFont, captionPosition: args.captionPosition ?? source.captionPosition, captionTexts: args.captionTexts, retainedMusic: source.music ?? source.retainedMusic, mode: 'edit', prompt: args.captionStyle === 'none' ? 'Remove TakeOne captions' : `Restyle captions: ${args.captionStyle}`, requestId: args.requestId, captionStyle: args.captionStyle, ...archive, parentJobId: source._id, rootJobId: source.rootJobId ?? source._id, aspect: source.aspect ?? '9:16' });
  },
});
export const listJobs = query({ args: { accountKey: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, { accountKey, paginationOpts }) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  // Account key also resets the browser's accumulated pages on account changes.
  if (identity.subject !== accountKey) return { page: [], isDone: true, continueCursor: '' };
  if (!Number.isInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > 50) throw new ConvexError('INVALID_PAGE_SIZE');
  const result = await ctx.db.query('genJobs').withIndex('by_user', q => q.eq('userId', identity.subject)).order('desc').paginate(paginationOpts);
  return { ...result, page: result.page.map(publicJob) };
}});
function publicJob(job: any) {
  const music = job.music ?? job.retainedMusic;
  return {
    _id: job._id,
    aspect: job.aspect ?? null,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt ?? null,
    hasCaptionArchive: !!captionArchiveSource(job),
    hasOutput: job.status === 'done' && !!job.storageKey,
    hasSource: !!(job.sourceStorageKey || job.sourceStorageId || job.sourceUrl),
    mode: job.mode,
    parentJobId: job.parentJobId ?? null,
    prompt: job.prompt,
    refunded: job.refunded ?? false,
    renderProgress: job.renderProgress ?? null,
    resultUrl: job.resultUrl ?? null,
    soundtrack: music ? { label: music.label, attribution: music.attribution } : null,
    status: job.status,
    telegramDeliveryStatus: job.telegramDeliveryStatus ?? null,
  };
}
export const myJobs = query({ args: {}, handler: async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  const jobs = await ctx.db.query('genJobs').withIndex('by_user', (q: any) => q.eq('userId', identity.subject)).order('desc').take(50);
  return jobs.map(publicJob);
}});
export const getJob = query({ args: { jobId: v.string() }, handler: async (ctx: any, { jobId }: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  const normalized = ctx.db.normalizeId('genJobs', jobId);
  const job = normalized ? await ctx.db.get(normalized) : null;
  return job?.userId === identity.subject ? publicJob(job) : null;
}});

export const getOwnedPrivateMedia = internalQuery({
  args: { jobId: v.id('genJobs'), userId: v.string() },
  handler: async (ctx, { jobId, userId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId || job.status !== 'done') return null;
    return {
      storageKey: job.storageKey,
      captionStorageKey: captionArchiveSource(job)?.sourceCaptionStorageKey,
    };
  },
});
export const versions = query({ args: { jobId: v.string(), rootOnly: v.optional(v.boolean()), accountKey: v.optional(v.string()) }, handler: async (ctx: any, { jobId, rootOnly, accountKey }: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  if (accountKey !== undefined && accountKey !== identity.subject) return [];
  const normalized = ctx.db.normalizeId('genJobs', jobId);
  const selected = normalized ? await ctx.db.get(normalized) : null;
  if (!selected || selected.userId !== identity.subject) return [];
  const rootId = selected.rootJobId ?? selected._id;
  const root = await ctx.db.get(rootId);
  if (!root || root.userId !== identity.subject) return [];
  if (rootOnly) return [{ _id: root._id, parentJobId: root.parentJobId, prompt: root.prompt, status: root.status, createdAt: root.createdAt, original: true }];
  const edits = await ctx.db.query('genJobs').withIndex('by_root_user', (q: any) => q.eq('rootJobId', rootId).eq('userId', identity.subject)).order('desc').take(50);
  return [root, ...edits].map(job => ({ _id: job._id, parentJobId: job.parentJobId, prompt: job.prompt, status: job.status, createdAt: job.createdAt, original: job._id === rootId }));
}});
export const listVersions = query({ args: { jobId: v.string(), accountKey: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx: any, { jobId, accountKey, paginationOpts }: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  const empty = { page: [], isDone: true, continueCursor: '' };
  if (identity.subject !== accountKey) return empty;
  if (!Number.isInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > 50) throw new ConvexError('INVALID_PAGE_SIZE');
  const normalized = ctx.db.normalizeId('genJobs', jobId);
  const selected = normalized ? await ctx.db.get(normalized) : null;
  if (!selected || selected.userId !== identity.subject) return empty;
  const rootId = selected.rootJobId ?? selected._id;
  const root = await ctx.db.get(rootId);
  if (!root || root.userId !== identity.subject) return empty;
  const result = await ctx.db.query('genJobs').withIndex('by_root_user', (q: any) => q.eq('rootJobId', rootId).eq('userId', identity.subject)).order('desc').paginate(paginationOpts);
  return { ...result, page: result.page.filter((job: any) => job._id !== rootId).map((job: any) => ({ _id: job._id, parentJobId: job.parentJobId, prompt: job.prompt, status: job.status, createdAt: job.createdAt, original: false })) };
}});
export const getDownload = action({ args: { jobId: v.id('genJobs') }, handler: async (ctx: any, args: any) => {
  const identity = await ctx.auth.getUserIdentity();
  const media = identity ? await ctx.runQuery(ref<'query'>('generate:getOwnedPrivateMedia'), { ...args, userId: identity.subject }) : null;
  if (!media?.storageKey) throw new ConvexError('VIDEO_UNAVAILABLE');
  const response = await dispatcher('sign', { storageKey: media.storageKey });
  return response.json();
}});
export const getCaptionCues = action({ args: { jobId: v.id('genJobs') }, handler: async (ctx, { jobId }): Promise<{ start: number; end: number; text: string }[]> => {
  const identity = await ctx.auth.getUserIdentity();
  const media = identity ? await ctx.runQuery(ref<'query'>('generate:getOwnedPrivateMedia'), { jobId, userId: identity.subject }) : null;
  if (!media?.captionStorageKey) throw new ConvexError('CAPTION_SOURCE_UNAVAILABLE');
  const signed = await (await dispatcher('sign-captions', { storageKey: media.captionStorageKey })).json();
  const url = new URL(signed.url);
  if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com') throw new Error('Invalid caption storage URL');
  const response = await fetch(url.href, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Caption download failed');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let raw = '', bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 512 * 1024) throw new Error('Caption archive too large');
      raw += decoder.decode(next.value, { stream: true });
    }
    raw += decoder.decode();
  } finally { await reader.cancel(); }
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !['clean', 'meme', 'karaoke'].includes(data.style) || !Array.isArray(data.cues) || !validCaptionTexts(data.cues.map((cue: any) => cue?.text))) throw new Error('Invalid caption archive');
  let last = -1;
  return data.cues.map((cue: any) => {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.start < last || cue.end <= cue.start || cue.end > 300.1) throw new Error('Invalid caption timing');
    last = cue.start;
    return { start: cue.start, end: cue.end, text: cue.text };
  });
}});
const workerArgs = { workerSecret: v.string(), jobId: v.id('genJobs'), leaseToken: v.string() };
function ownsLease(job: any, token: string) {
  return job?.status === 'processing' && job.leaseToken === token && job.leaseExpiresAt > Date.now();
}
export const claimJob = mutation({ args: { workerSecret: v.string(), jobId: v.id('genJobs'), workerId: v.string() }, handler: async (ctx: any, args: any) => {
  checkWorker(args.workerSecret);
  if (!/^[\w-]{8,100}$/.test(args.workerId)) throw new ConvexError('INVALID_WORKER');
  if (renderingPaused()) return null;
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== 'dispatched' || !Number.isFinite(job.leaseExpiresAt) || job.leaseExpiresAt <= Date.now() || !Number.isSafeInteger(job.attempts) || job.attempts < 1) return null;
  const assemblySources: any[] = [];
  if (job.timelineExport) {
    const resolved = new Map<string, any>();
    for (const clip of job.timelineExport.timeline.video) {
      const source = clip.source;
      const key = source.kind === 'job' ? `job:${source.jobId}` : `upload:${source.uploadId}`;
      let descriptor = resolved.get(key);
      if (!descriptor) {
        const record = await ctx.db.get(source.kind === 'job' ? source.jobId : source.uploadId);
        if (!record || record.userId !== job.userId || !hasTrustedMediaMetadata(record)) throw new ConvexError('PROJECT_SOURCE_UNAVAILABLE');
        if (source.kind === 'job') {
          if (record.status !== 'done' || !hasManagedVideoOutput(record)) throw new ConvexError('PROJECT_SOURCE_UNAVAILABLE');
          descriptor = { source, storageKey: record.storageKey, durationMs: record.mediaDurationMs, width: record.mediaWidth, height: record.mediaHeight, hasAudio: record.mediaHasAudio };
        } else {
          const storageUrl = record.status === 'ready' && record.kind !== 'audio' && record.storageId ? await ctx.storage.getUrl(record.storageId) : null;
          if (!storageUrl) throw new ConvexError('PROJECT_SOURCE_UNAVAILABLE');
          descriptor = { source, storageUrl, durationMs: record.mediaDurationMs, width: record.mediaWidth, height: record.mediaHeight, hasAudio: record.mediaHasAudio };
        }
        resolved.set(key, descriptor);
        assemblySources.push(descriptor);
      }
      if (clip.sourceEndMs > descriptor.durationMs) throw new ConvexError('PROJECT_SOURCE_UNAVAILABLE');
    }
  }
  const leaseToken = `${args.workerId}-${job.attempts}`;
  await ctx.db.patch(job._id, { scenePlan: undefined, scenePlanLeaseToken: undefined, scenePlanAttempt: undefined, renderProgressHistory: [...(job.renderProgressHistory ?? []), ...(job.renderProgress ? [job.renderProgress] : [])].slice(-2), renderProgress: { attempt: job.attempts, startedAt: Date.now(), stages: [] }, status: 'processing', leaseToken, leaseExpiresAt: Date.now() + LEASE_MS, startedAt: Date.now() });
  return { sceneReplacement: job.sceneReplacement, timelineExport: job.timelineExport, assemblySources: job.timelineExport ? assemblySources : undefined, queueWaitMs: job.startedAt === undefined ? Math.max(0, Date.now() - job.createdAt) : undefined, jobId: job._id, userId: job.userId, mode: job.mode, prompt: job.prompt, aspect: job.aspect ?? '9:16',
    sourceUploadUrl: job.sourceStorageId ? await ctx.storage.getUrl(job.sourceStorageId) : undefined,
    brand: job.brand ? { ...job.brand, logo: job.brand.logo ? Array.from(new Uint8Array(job.brand.logo)) : undefined } : undefined,
    speakerReframe: job.speakerReframe, hookTitle: job.hookTitle, transforms: job.transforms, captionTransform: job.captionTransform, captionFont: job.captionFont, captionPosition: job.captionPosition, captionTexts: job.captionTexts, captionStyle: job.captionStyle, captionLanguage: job.captionLanguage, sourceCaptionStorageKey: job.sourceCaptionStorageKey, generationKind: job.generationKind, aiOperation: job.aiOperation,
    music: job.music ? { ...job.music, storageUrl: job.music.storageId ? await ctx.storage.getUrl(job.music.storageId) : undefined } : undefined, sourceStorageKey: job.sourceStorageKey, telegramFileId: job.telegramFileId, telegramChatId: job.telegramChatId,
    isPro: job.reservation === 'credit', leaseToken };
}});
export const heartbeat = mutation({ args: workerArgs, handler: async (ctx: any, args: any) => {
  checkWorker(args.workerSecret); const job = await ctx.db.get(args.jobId);
  if (!ownsLease(job, args.leaseToken)) return false;
  await ctx.db.patch(job._id, { leaseExpiresAt: Date.now() + LEASE_MS }); return true;
}});
// At most one entry per enumerated stage; timestamps come from the server.
export const reportProgress = mutation({ args: { ...workerArgs, stage: renderStageValidator }, handler: async (ctx: any, args: any) => {
  checkWorker(args.workerSecret);
  const job = await ctx.db.get(args.jobId);
  if (!ownsLease(job, args.leaseToken)) return false;
  const progress = job.renderProgress;
  // Older in-flight workers/jobs remain compatible but cannot invent an attempt.
  if (!progress || progress.attempt !== job.attempts || progress.finishedAt !== undefined) return false;
  const last = progress.stages.at(-1);
  const rank = renderStages.indexOf(args.stage);
  if (last && rank <= renderStages.indexOf(last.stage)) return true;
  await ctx.db.patch(job._id, { renderProgress: { ...progress, stages: [...progress.stages, { stage: args.stage, startedAt: Date.now() }] } });
  return true;
}});
export const completeJob = mutation({ args: { ...workerArgs, storageKey: v.string(), ...mediaMetadataArgs, sceneArchiveOnly: v.optional(v.boolean()), cleanStorageKey: v.optional(v.string()), captionStorageKey: v.optional(v.string()) }, handler: async (ctx: any, args: any) => {
  checkWorker(args.workerSecret); const job = await ctx.db.get(args.jobId);
  if (!ownsLease(job, args.leaseToken)) return false;
  if (args.storageKey !== `videos/${job._id}/${args.leaseToken}.mp4`) throw new ConvexError('INVALID_OUTPUT');
  const hasArchive = args.cleanStorageKey !== undefined || args.captionStorageKey !== undefined;
  if (args.sceneArchiveOnly && !hasArchive) throw new ConvexError('SCENE_ARCHIVE_REQUIRED');
  if (job.sceneReplacement && (!hasArchive || job.scenePlanLeaseToken !== args.leaseToken || job.scenePlanAttempt !== job.attempts)) throw new ConvexError('SCENE_ARCHIVE_REQUIRED');
  if (hasArchive && (args.cleanStorageKey !== `videos/${job._id}/${args.leaseToken}-clean.mp4` || args.captionStorageKey !== `captions/${job._id}/${args.leaseToken}.json`)) throw new ConvexError('INVALID_CAPTION_ARCHIVE');
  const metadata = validateMediaMetadata(args);
  await ctx.db.patch(job._id, { ...finishProgress(job), ...metadata, sceneArchive: args.sceneArchiveOnly ? { cleanStorageKey: args.cleanStorageKey, captionStorageKey: args.captionStorageKey } : undefined, cleanStorageKey: args.sceneArchiveOnly ? undefined : args.cleanStorageKey, captionStorageKey: args.sceneArchiveOnly ? undefined : args.captionStorageKey, status: 'done', storageKey: args.storageKey, finishedAt: Date.now(), leaseExpiresAt: undefined });
  if (job.telegramChatId) {
    await ctx.db.patch(job._id, { telegramDeliveryStatus: 'pending' });
    await ctx.scheduler.runAfter(0, ref<'action'>('telegramDelivery:send'), { jobId: job._id });
  }
  await wake(ctx); return true;
}});
export const failJob = mutation({ args: { ...workerArgs, error: v.string() }, handler: async (ctx: any, args: any) => {
  checkWorker(args.workerSecret); const job = await ctx.db.get(args.jobId);
  if (!ownsLease(job, args.leaseToken)) return false;
  await retryOrFail(ctx, job, 'Video processing failed after three attempts. Your allowance has been restored.');
  await wake(ctx); return true;
}});
export const cancelJob = mutation({ args: { jobId: v.id('genJobs') }, handler: async (ctx: any, args: any) => {
  await cancelQueuedJob(ctx, await owner(ctx), args.jobId);
}});

export const capabilities = query({ args: {}, handler: () => {
  return productCapabilities(process.env);
} });
export const beginAi = mutation({ args: workerArgs, handler: async (ctx: any, args: any) => {
  checkWorker(args.workerSecret); const job = await ctx.db.get(args.jobId);
  if (!ownsLease(job, args.leaseToken) || job.generationKind !== 'ai' || job.aiStarted) return false;
  await ctx.db.patch(job._id, { aiStarted: true }); return true;
} });
export const saveAiOperation = mutation({ args: { ...workerArgs, operation: v.string() }, handler: async (ctx: any, args: any) => {
  checkWorker(args.workerSecret); const job = await ctx.db.get(args.jobId);
  if (!ownsLease(job, args.leaseToken) || job.generationKind !== 'ai' || !job.aiStarted) throw new ConvexError('AI_LEASE_LOST');
  if (!/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/publishers\/google\/models\/veo-[a-zA-Z0-9.-]+\/operations\/[\w-]+$/.test(args.operation)) throw new ConvexError('INVALID_AI_OPERATION');
  if (job.aiOperation && job.aiOperation !== args.operation) throw new ConvexError('AI_OPERATION_CONFLICT');
  await ctx.db.patch(job._id, { aiOperation: args.operation });
} });

export const requestBrandEdit = mutation({ args: { sourceJobId: v.id('genJobs'), brandKit: brandSelection, requestId: v.string() }, handler: async (ctx: any, args: any) => {
  const user = await owner(ctx), source = await ctx.db.get(args.sourceJobId);
  if (!source || source.userId !== user.tokenIdentifier || source.status !== 'done') throw new ConvexError('NOT_FOUND');
  const archive = captionArchiveSource(source);
  if (!archive) throw new ConvexError('CAPTION_SOURCE_UNAVAILABLE');
  return enqueue(ctx, user, { ...archive, brandKit: args.brandKit, captionStyle: 'clean', mode: 'edit', prompt: 'Apply saved brand kit', requestId: args.requestId, parentJobId: source._id, rootJobId: source.rootJobId ?? source._id, retainedMusic: source.music ?? source.retainedMusic, aspect: source.aspect ?? '9:16' });
}});
