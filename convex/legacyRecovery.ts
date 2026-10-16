import { internalMutationGeneric as mutation } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { renderingPaused } from './jobs';
const failure = 'The worker stopped responding. Your allowance has been restored.';
/** Operator-only correction of an explicitly inspected deployment failure batch. No billing or scheduling. */
export const restorePausedFailures = mutation({args:{jobs:v.array(v.object({jobId:v.id('genJobs'),createdAt:v.number(),finishedAt:v.number()})),windowStart:v.number(),windowEnd:v.number()},handler:async(ctx,args)=>{
 if(!renderingPaused())throw new ConvexError('RENDERING_MUST_BE_PAUSED');
 if(!args.jobs.length||args.jobs.length>25||new Set(args.jobs.map(j=>j.jobId)).size!==args.jobs.length||!Number.isFinite(args.windowStart)||!Number.isFinite(args.windowEnd)||args.windowEnd<=args.windowStart||args.windowEnd-args.windowStart>3600000)throw new ConvexError('INVALID_RECOVERY_BATCH');
 const pending=[];
 for(const expected of args.jobs){
  const job=await ctx.db.get(expected.jobId);
  if(job?.legacyRecovery?.failedAt===expected.finishedAt&&job.createdAt===expected.createdAt)continue;
  if(!job||job.legacyRecovery||job.status!=='failed'||job.reservation!==undefined||job.refunded!==undefined||job.storageKey||job.resultUrl||job.cleanStorageKey||job.captionStorageKey||job.sceneArchive||job.aiOperation||job.aiStarted||job.leaseToken||job.leaseExpiresAt||job.attempts!==3||job.error!==failure||job.createdAt!==expected.createdAt||job.finishedAt!==expected.finishedAt||job.createdAt>=args.windowStart||job.finishedAt<args.windowStart||job.finishedAt>args.windowEnd)throw new ConvexError('RECOVERY_RECORD_CHANGED');
  pending.push(job);
 }
 for(const job of pending)await ctx.db.patch(job._id,{status:'queued',error:undefined,finishedAt:undefined,legacyRecovery:{at:Date.now(),failedAt:job.finishedAt!,error:job.error!}});
 return {restored:pending.length,replayed:args.jobs.length-pending.length};
}});
