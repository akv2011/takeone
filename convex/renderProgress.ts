import { v } from 'convex/values';

// Order follows the actual pipeline. Branches omit work they do not perform.
export const renderStages = ['script', 'narration', 'footage', 'moments', 'source', 'transcription', 'cut', 'finishing', 'checking', 'saving'] as const;
export const renderStageValidator = v.union(...renderStages.map(stage => v.literal(stage)));
export const renderProgressValidator = v.object({
  attempt: v.number(), startedAt: v.number(), finishedAt: v.optional(v.number()),
  stages: v.array(v.object({ stage: renderStageValidator, startedAt: v.number() })),
});
export function finishProgress(job: any) {
  return job.renderProgress && job.renderProgress.finishedAt === undefined
    ? { renderProgress: { ...job.renderProgress, finishedAt: Date.now() } } : {};
}
