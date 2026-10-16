import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { checkWorker } from './jobs';
import { savedScenePlanValidator, validateSavedScenePlan, type SavedScenePlan } from './scenePlanValues';

const planIdentity = (p: SavedScenePlan) => JSON.stringify([p.version, p.durationSec, p.scenes.map(s => [s.startSec, s.endSec, s.purpose, s.searchTerms, s.shotType, s.motion])]);

export const save = mutation({ args: { workerSecret: v.string(), jobId: v.id('genJobs'), leaseToken: v.string(), plan: savedScenePlanValidator }, handler: async (ctx, args) => {
  checkWorker(args.workerSecret);
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== 'processing' || job.leaseToken !== args.leaseToken || (job.leaseExpiresAt ?? 0) <= Date.now()) return false;
  if ((job.mode !== 'generate' && !job.sceneReplacement) || job.generationKind === 'ai') throw new ConvexError('SCENE_PLAN_UNAVAILABLE');
  validateSavedScenePlan(args.plan);
  if (job.sceneReplacement && planIdentity(job.sceneReplacement.plan) !== planIdentity(args.plan)) throw new ConvexError('SCENE_PLAN_CONFLICT');
  // A lost response can retry the same write, but a running attempt cannot swap its plan.
  if (job.scenePlan) {
    if (job.scenePlanLeaseToken !== args.leaseToken || planIdentity(job.scenePlan) !== planIdentity(args.plan)) throw new ConvexError('SCENE_PLAN_CONFLICT');
    return true;
  }
  await ctx.db.patch(job._id, { scenePlan: args.plan, scenePlanLeaseToken: args.leaseToken, scenePlanAttempt: job.attempts ?? 0 });
  return true;
}});

export const get = query({ args: { jobId: v.string(), accountKey: v.string() }, handler: async (ctx, { jobId, accountKey }) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  if (identity.subject !== accountKey) return null;
  const id = ctx.db.normalizeId('genJobs', jobId), job = id ? await ctx.db.get(id) : null;
  if (!job || job.userId !== identity.subject) return null;
  if (!job.scenePlan) return { state: 'unavailable' as const, scenes: [] };
  const sameAttempt = job.scenePlanAttempt === job.attempts;
  const completed = job.status === 'done' && sameAttempt && job.scenePlanLeaseToken === job.leaseToken &&
    job.storageKey === `videos/${job._id}/${job.scenePlanLeaseToken}.mp4`;
  const state = completed ? 'completed' as const : job.status === 'failed' ? 'failed' as const : job.status === 'cancelled' ? 'cancelled' as const :
    job.status === 'processing' && sameAttempt && job.scenePlanLeaseToken === job.leaseToken && (job.leaseExpiresAt ?? 0) > Date.now() ? 'rendering' as const : 'previous_attempt' as const;
  // Explicit projection excludes worker credentials, source paths, brief and provider internals.
  return { state, attempt: job.scenePlanAttempt, durationSec: job.scenePlan.durationSec,
    scenes: job.scenePlan.scenes.map((s: SavedScenePlan['scenes'][number]) => ({ startSec: s.startSec, endSec: s.endSec, purpose: s.purpose, searchTerms: s.searchTerms, shotType: s.shotType, motion: s.motion })) };
}});
