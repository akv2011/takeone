import { mutationGeneric as mutation } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { owner, enqueue } from './jobs';
import { captionArchiveSource, captionTransformSource } from './captions';

export const request = mutation({
  args: { sourceJobId: v.id('genJobs'), titles: v.array(v.string()), requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await owner(ctx), source = await ctx.db.get(args.sourceJobId);
    if (!source || source.userId !== user.tokenIdentifier || source.status !== 'done' || !source.storageKey) throw new ConvexError('SOURCE_UNAVAILABLE');
    const titles = args.titles.map(text => text.trim().replace(/\s+/g, ' '));
    if (titles.length !== 3 || titles.some(text => text.length < 3 || text.length > 100 || /[\x00-\x1f\x7f]/.test(text)) || new Set(titles.map(text => text.toLowerCase())).size !== 3) throw new ConvexError('THREE_DISTINCT_HOOKS_REQUIRED');
    if (!/^[\w-]{8,90}$/.test(args.requestId)) throw new ConvexError('INVALID_REQUEST_ID');
    const jobs = [];
    // One transaction: queue/allowance failure rolls back every reservation. Refresh
    // the user each iteration because earlier enqueues change its free/paid balance.
    for (const [index, hookTitle] of titles.entries()) {
      const currentUser = await ctx.db.get(user._id);
      jobs.push(await enqueue(ctx, currentUser, { brand: captionArchiveSource(source) ? source.brand : undefined, mode: 'edit', prompt: 'Apply opening title', hookTitle,
        sourceStorageKey: source.storageKey, ...captionTransformSource(source),
        parentJobId: source._id, rootJobId: source.rootJobId ?? source._id,
        retainedMusic: source.music ?? source.retainedMusic, aspect: source.aspect ?? '9:16',
        requestId: `${args.requestId}-${index}` }));
    }
    return { jobIds: jobs.map(job => job.jobId) };
  },
});
