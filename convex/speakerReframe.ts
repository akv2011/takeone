import { mutationGeneric as mutation } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { owner, enqueue } from './jobs';
import { captionArchiveSource, captionTransformSource } from './captions';
export const request = mutation({ args: { sourceJobId: v.id('genJobs'), requestId: v.string() }, handler: async (ctx, args) => {
 const user = await owner(ctx), source = await ctx.db.get(args.sourceJobId);
 if (!source || source.userId !== user.tokenIdentifier || source.status !== 'done' || !source.storageKey) throw new ConvexError('SOURCE_UNAVAILABLE');
 return enqueue(ctx, user, { brand: captionArchiveSource(source) ? source.brand : undefined, mode: 'edit', prompt: 'Follow the single speaker', speakerReframe: true,
   sourceStorageKey: source.storageKey, ...captionTransformSource(source), aspect: '9:16',
   parentJobId: source._id, rootJobId: source.rootJobId ?? source._id,
   retainedMusic: source.music ?? source.retainedMusic, requestId: args.requestId });
}});
