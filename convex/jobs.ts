import { productCapabilities } from './capabilities';
import { resolveBrand } from './brandValues';
import { finishProgress } from './renderProgress';
declare const process: { env: Record<string, string | undefined> };
import { internalMutationGeneric as internalMutation, internalActionGeneric as internalAction, makeFunctionReference as ref } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { resolveOwnedMusic } from './music';
import { FREE_LIMIT } from './config';

export const renderingPaused = () => process.env.MANAGED_RENDERING_PAUSED === 'true';
export const MAX_ACTIVE = 10;
export const LEASE_MS = 90_000;
const DISPATCH_MS = 180_000;
const MAX_ATTEMPTS = 3;
const pumpRef = ref<'mutation'>('jobs:pump');
export const modeValidator = v.union(v.literal('generate'), v.literal('clip'), v.literal('edit'));
export const aspectValidator = v.union(v.literal('9:16'), v.literal('1:1'), v.literal('16:9'));
export const wake = (ctx: any) => ctx.scheduler.runAfter(0, pumpRef, {});

export function checkWorker(secret: string) {
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError('UNAUTHORIZED_WORKER');
}
export function validatePrompt(prompt: string, requestId: string) {
  if (prompt.trim().length < 6 || prompt.length > 4000) throw new ConvexError('PROMPT_LENGTH');
  if (!/^[\w-]{8,100}$/.test(requestId)) throw new ConvexError('INVALID_REQUEST_ID');
}
export async function owner(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  const user = await ctx.db.query('users').withIndex('by_token', (q: any) => q.eq('tokenIdentifier', identity.subject)).unique();
  if (!user) throw new ConvexError('NO_USER');
  return user;
}
// Compare render inputs only; leases, output paths and billing evolve after admission.
function submissionContent(input: any) {
  const fields = ['speakerReframe', 'hookTitle', 'mode', 'captionTransform', 'captionFont', 'captionPosition', 'captionStyle', 'captionTexts', 'sourceStorageKey', 'sourceCaptionStorageKey', 'sourceStorageId', 'telegramFileId', 'telegramChatId', 'parentJobId', 'rootJobId', 'projectId', 'projectRevisionId'];
  const result: Record<string, unknown> = { prompt: input.prompt.trim(), aspect: input.aspect ?? '9:16', generationKind: input.generationKind ?? 'stock' };
  for (const field of fields) result[field] = input[field];
  // Canonical key ordering avoids request conflicts after Convex serialization.
  if (input.sceneReplacement) result.sceneReplacement = [input.sceneReplacement.index, input.sceneReplacement.uploadId, input.sceneReplacement.plan.scenes.map((s: any) => [s.startSec, s.endSec, s.purpose, s.searchTerms, s.shotType, s.motion])];
  if (input.brandKit) result.brandKit = { kitId: input.brandKit.kitId, revision: input.brandKit.revision };
  if (input.transforms) result.transforms = { trim: input.transforms.trim ? { start: input.transforms.trim.start, end: input.transforms.trim.end } : undefined, speed: input.transforms.speed, aspect: input.transforms.aspect, fit: input.transforms.fit };
  if (input.music) result.music = { trackId: input.music.trackId, volume: input.music.volume, duck: input.music.duck, replaceSourceAudio: input.music.replaceSourceAudio ?? false };
  if (input.timelineExport) {
    const timeline = input.timelineExport.timeline;
    result.timelineExport = [
      input.timelineExport.profile.container, input.timelineExport.profile.fps,
      timeline.version, timeline.aspect, timeline.durationMs,
      timeline.video.map((clip: any) => [clip.id, clip.source.kind, clip.source.jobId ?? clip.source.uploadId, clip.sourceStartMs, clip.sourceEndMs, clip.timelineStartMs, clip.fit, clip.muted]),
      timeline.transitions.map((transition: any) => [transition.id, transition.fromClipId, transition.toClipId, transition.type, transition.durationMs]),
      timeline.text.map((layer: any) => [layer.id, layer.text, layer.startMs, layer.endMs, layer.x, layer.y, layer.scale, layer.opacity, layer.font, layer.weight, layer.color, layer.shadow, layer.animation]),
      timeline.graphics.map((layer: any) => [layer.id, layer.text, layer.startMs, layer.endMs, layer.x, layer.y, layer.scale, layer.opacity, layer.font, layer.weight, layer.color, layer.shadow, layer.animation]),
    ];
  }
  if (input.brandKit) { delete result.captionStyle; delete result.captionFont; }
  return JSON.stringify(result);
}

export async function enqueue(ctx: any, user: any, input: any) {
  validatePrompt(input.prompt, input.requestId);
  const prior = await ctx.db.query('genJobs').withIndex('by_request', (q: any) => q.eq('userId', user.tokenIdentifier).eq('requestId', input.requestId)).unique();
  if (prior) {
    if (submissionContent(prior) !== submissionContent(input)) throw new ConvexError('REQUEST_CONTENT_CONFLICT');
    return { jobId: prior._id, billing: prior.reservation };
  }
  const capabilities = productCapabilities(process.env);
  const capability = input.mode === 'generate'
    ? (input.generationKind === 'ai' ? capabilities.aiVideo : capabilities.stockVideo)
    : input.mode === 'clip' ? capabilities.youtubeClips : capabilities.rendering;
  if (!capability.available) throw new ConvexError({ code: "RENDER_UNAVAILABLE", message: `${capability.reason} No allowance was used.` });
  const brand = await resolveBrand(ctx, user.tokenIdentifier, input.brandKit);
  if (brand && input.generationKind === 'ai') throw new ConvexError('AI_BRAND_UNAVAILABLE');
  const music = await resolveOwnedMusic(ctx, user.tokenIdentifier, input.music);
  const recent = await ctx.db.query('genJobs').withIndex('by_user', (q: any) => q.eq('userId', user.tokenIdentifier)).order('desc').take(50);
  if (recent.filter((j: any) => ['queued', 'dispatched', 'processing'].includes(j.status)).length >= 3) throw new ConvexError('TOO_MANY_JOBS');
  const queued = await ctx.db.query('genJobs').withIndex('by_status', (q: any) => q.eq('status', 'queued')).take(1000);
  if (queued.length >= 1000) throw new ConvexError('QUEUE_FULL');
  const reservation = user.freeUsed < FREE_LIMIT ? 'free' : 'credit';
  if (reservation === 'credit' && user.credits < 1) throw new ConvexError({ code: 'NO_CREDITS' });
  await ctx.db.patch(user._id, reservation === 'free' ? { freeUsed: user.freeUsed + 1 } : { credits: user.credits - 1 });
  const jobId = await ctx.db.insert('genJobs', {
    ...input, brand: brand ?? input.brand, ...(brand ? { captionStyle: brand.captionStyle, captionFont: brand.font } : {}), music, musicStorageId: music?.storageId, prompt: input.prompt.trim(), userId: user.tokenIdentifier, reservation,
    status: 'queued', createdAt: Date.now(), attempts: 0,
  });
  await wake(ctx);
  return { jobId, billing: reservation };
}
export async function refund(ctx: any, job: any) {
  if (job.refunded || !job.reservation) return;
  const user = await ctx.db.query('users').withIndex('by_token', (q: any) => q.eq('tokenIdentifier', job.userId)).unique();
  if (user) await ctx.db.patch(user._id, job.reservation === 'free' ? { freeUsed: Math.max(0, user.freeUsed - 1) } : { credits: user.credits + 1 });
  await ctx.db.patch(job._id, { refunded: true });
}
export async function cancelQueuedJob(ctx: any, user: any, jobId: any) {
  const job = await ctx.db.get(jobId);
  if (!job || job.userId !== user.tokenIdentifier) throw new ConvexError('NOT_FOUND');
  if (!['queued', 'dispatched'].includes(job.status)) throw new ConvexError('CANNOT_CANCEL_RUNNING_JOB');
  await ctx.db.patch(job._id, { ...finishProgress(job), status: 'cancelled', leaseToken: undefined, leaseExpiresAt: undefined, finishedAt: Date.now() });
  await refund(ctx, job); await wake(ctx);
}

export async function retryOrFail(ctx: any, job: any, error: string) {
  if ((job.attempts ?? 0) >= MAX_ATTEMPTS) {
    await ctx.db.patch(job._id, { ...finishProgress(job), status: 'failed', error: error.slice(0, 500), finishedAt: Date.now(), leaseToken: undefined, leaseExpiresAt: undefined });
    await refund(ctx, job);
  } else {
    await ctx.db.patch(job._id, { ...finishProgress(job), status: 'queued', error: undefined, leaseToken: undefined, leaseExpiresAt: undefined });
  }
}

// Admission is one transaction: all executions share this ten-slot ceiling.
export const pump = internalMutation({ args: {}, handler: async (ctx: any) => {
  if (renderingPaused()) return;
  const active = (await Promise.all(['dispatched', 'processing'].map(status => ctx.db.query('genJobs').withIndex('by_status', (q: any) => q.eq('status', status)).collect()))).flat();
  const live = [];
  for (const job of active) {
    if ((job.leaseExpiresAt ?? 0) <= Date.now()) await retryOrFail(ctx, job, 'The worker stopped responding. Your allowance has been restored.');
    else live.push(job);
  }
  let slots = Math.max(0, MAX_ACTIVE - live.length);
  const users = new Set(live.map(j => j.userId));
  const queued = await ctx.db.query('genJobs').withIndex('by_status', (q: any) => q.eq('status', 'queued')).order('asc').take(1000);
  for (const job of queued) {
    if (!slots) break;
    if (users.has(job.userId)) continue;
    const attempt = (job.attempts ?? 0) + 1;
    await ctx.db.patch(job._id, { status: 'dispatched', attempts: attempt, leaseExpiresAt: Date.now() + DISPATCH_MS });
    await ctx.scheduler.runAfter(0, ref<'action'>('jobs:dispatch'), { jobId: job._id, attempt });
    users.add(job.userId); slots--;
  }
}});

export async function dispatcher(path: string, body: unknown) {
  const url = process.env.DISPATCH_URL;
  const secret = process.env.DISPATCH_SECRET;
  if (!url?.startsWith('https://') || !secret) throw new Error('Managed video service is not configured');
  const response = await fetch(`${url.replace(/\/$/, '')}/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Managed video service returned ${response.status}`);
  return response;
}
export const dispatch = internalAction({
  args: { jobId: v.id('genJobs'), attempt: v.number() },
  handler: async (_ctx: any, args: any) => {
    if (renderingPaused()) return;
    // If acceptance is ambiguous, leave the dispatch lease in place. Recovery retries
    // later; duplicate executions race on a single atomic claim and cannot bill twice.
    try { await dispatcher('dispatch', { jobId: args.jobId }); }
    catch { console.error('Video dispatch was not confirmed; lease recovery will retry', args.jobId, args.attempt); }
  },
});
