import { v } from 'convex/values';
export const sentimentValidator = v.union(v.literal('positive'), v.literal('mixed'), v.literal('negative'));
export const feedbackSummaryValidator = v.object({
  sentiment: sentimentValidator, why: v.string(), themes: v.array(v.string()),
  notes: v.array(v.object({ id: v.id('reviewComments'), at: v.number(), sentiment: sentimentValidator })), noteCount: v.number(), createdAt: v.number(),
});
