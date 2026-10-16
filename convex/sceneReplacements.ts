import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { captionArchiveSource } from './captions';
import { enqueue, owner, validatePrompt } from './jobs';
import { validateSavedScenePlan } from './scenePlanValues';
import { hasTrustedMediaMetadata } from './mediaMetadata';

export function replaceableSceneSource(job: any) {
  const archive = job?.sceneArchive ?? job;
  return job?.status === 'done' && job.scenePlan && job.scenePlanAttempt === job.attempts && job.scenePlanLeaseToken === job.leaseToken &&
    job.storageKey === `videos/${job._id}/${job.leaseToken}.mp4` && archive.cleanStorageKey === `videos/${job._id}/${job.leaseToken}-clean.mp4` && archive.captionStorageKey === `captions/${job._id}/${job.leaseToken}.json` && captionArchiveSource(archive);
}
export const options = query({ args: { jobId: v.string(), accountKey: v.string() }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.subject !== args.accountKey) return { eligible: false, uploads: [] };
  const id = ctx.db.normalizeId('genJobs', args.jobId), job = id ? await ctx.db.get(id) : null;
  if (job?.userId !== identity.subject || !replaceableSceneSource(job)) return { eligible: false, uploads: [] };
  const uploads = await ctx.db.query('uploads').withIndex('by_user_status', (q: any) => q.eq('userId', identity.subject).eq('status', 'ready')).take(10);
  return { eligible: true, uploads: uploads.filter(u => u.kind !== 'audio' && u.storageId && hasTrustedMediaMetadata(u)).map(u => ({ id: u._id, name: u.name })) };
}});
export const request = mutation({ args: { sourceJobId: v.id('genJobs'), uploadId: v.id('uploads'), index: v.number(), requestId: v.string(), confirmedOwnership: v.boolean() }, handler: async (ctx, args) => {
  const user = await owner(ctx);
  validatePrompt('Replace a saved scene', args.requestId);
  if (!args.confirmedOwnership) throw new ConvexError('CONFIRM_VIDEO_RIGHTS');
  const prior = await ctx.db.query('genJobs').withIndex('by_request', (q: any) => q.eq('userId', user.tokenIdentifier).eq('requestId', args.requestId)).unique();
  if (prior) {
    if (prior.parentJobId !== args.sourceJobId || prior.sceneReplacement?.index !== args.index || prior.sceneReplacement?.uploadId !== args.uploadId) throw new ConvexError('REQUEST_CONTENT_CONFLICT');
    return { jobId: prior._id, billing: prior.reservation };
  }
  const source = await ctx.db.get(args.sourceJobId), upload = await ctx.db.get(args.uploadId);
  if (source?.userId !== user.tokenIdentifier || !replaceableSceneSource(source)) throw new ConvexError('SCENE_SOURCE_UNAVAILABLE');
  if (!upload || upload.userId !== user.tokenIdentifier || upload.status !== 'ready' || upload.kind === 'audio' || !upload.storageId || !hasTrustedMediaMetadata(upload)) throw new ConvexError('UPLOAD_NOT_READY');
  const plan = source!.scenePlan;
  validateSavedScenePlan(plan);
  if (!Number.isInteger(args.index) || args.index < 0 || args.index >= plan.scenes.length) throw new ConvexError('INVALID_SCENE_INDEX');
  const updated = { ...plan, scenes: plan.scenes.map((s: any, i: number) => i === args.index ? { ...s, purpose: 'Creator-uploaded replacement', searchTerms: ['Creator-uploaded video'], shotType: 'Uploaded clip', motion: 'As uploaded' } : s) };
  return enqueue(ctx, user, { mode: 'edit', prompt: `Replace scene ${args.index + 1}`, requestId: args.requestId,
    sourceStorageId: upload.storageId, ...captionArchiveSource(source!.sceneArchive ?? source!),
    captionStyle: source!.captionStyle, captionFont: source!.captionFont, captionPosition: source!.captionPosition,
    sceneReplacement: { index: args.index, uploadId: args.uploadId, plan: updated },
    brand: source!.brand, retainedMusic: source!.music ?? source!.retainedMusic, aspect: source!.aspect ?? '9:16', parentJobId: source!._id, rootJobId: source!.rootJobId ?? source!._id });
}});
