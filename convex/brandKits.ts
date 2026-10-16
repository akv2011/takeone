import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { owner } from './jobs';
import { brandSettings, validateBrand } from './brandValues';
export const list = query({ args: { accountKey: v.string() }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.subject !== args.accountKey) return [];
  const kits = await ctx.db.query('brandKits').withIndex('by_user', q => q.eq('userId', identity.subject)).take(5);
  return kits.map(({ _id, name, revision, settings }) => ({ _id, name, revision, settings }));
}});
export const save = mutation({ args: { kitId: v.optional(v.id('brandKits')), revision: v.optional(v.number()), name: v.string(), settings: brandSettings }, handler: async (ctx, args) => {
  const user = await owner(ctx), settings = validateBrand(args.settings);
  if (!args.name.trim() || args.name.length > 60) throw new ConvexError('INVALID_BRAND_NAME');
  if (args.kitId) {
    const kit = await ctx.db.get(args.kitId);
    if (!kit || kit.userId !== user.tokenIdentifier) throw new ConvexError('BRAND_KIT_NOT_FOUND');
    if (kit.revision !== args.revision) throw new ConvexError('BRAND_KIT_CHANGED');
    await ctx.db.patch(kit._id, { name: args.name.trim(), settings, revision: kit.revision + 1 });
    return { kitId: kit._id, revision: kit.revision + 1 };
  }
  const kits = await ctx.db.query('brandKits').withIndex('by_user', q => q.eq('userId', user.tokenIdentifier)).take(5);
  if (kits.length >= 5) throw new ConvexError('BRAND_KIT_LIMIT');
  return { kitId: await ctx.db.insert('brandKits', { userId: user.tokenIdentifier, name: args.name.trim(), revision: 1, settings }), revision: 1 };
}});
