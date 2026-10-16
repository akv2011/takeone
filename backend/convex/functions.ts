// Convex mutations/queries (B5). Illustrative — mirror of src/data/index.ts.
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const createJob = mutation({
  args: { jobId: v.string(), userId: v.string(), mode: v.string(), isPro: v.boolean() },
  handler: async (ctx, a) => ctx.db.insert('jobs', { ...a, status: 'queued' }),
});
export const setStatus = mutation({
  args: { jobId: v.string(), status: v.string() },
  handler: async (ctx, a) => {
    const j = await ctx.db.query('jobs').filter((q) => q.eq(q.field('jobId'), a.jobId)).first();
    if (j) await ctx.db.patch(j._id, { status: a.status });
  },
});
export const setPro = mutation({
  args: { userId: v.string() },
  handler: async (ctx, a) => {
    const u = await ctx.db.query('users').withIndex('by_userId', (q) => q.eq('userId', a.userId)).first();
    if (u) await ctx.db.patch(u._id, { isPro: true });
    else await ctx.db.insert('users', { userId: a.userId, platform: 'telegram', isPro: true });
  },
});
export const freeUsedToday = query({
  args: { userId: v.string(), day: v.string() },
  handler: async (ctx, a) => {
    const row = await ctx.db.query('usage').withIndex('by_user_day', (q) => q.eq('userId', a.userId).eq('day', a.day)).first();
    return row?.count ?? 0;
  },
});
