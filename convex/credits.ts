import { queryGeneric as query, mutationGeneric as mutation, internalMutationGeneric as internalMutation } from "convex/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { PACKS } from "./config.js";

export const getPacks = query({ args: {}, handler: async () => PACKS });

// Legacy entrypoint cannot debit an account without creating a durable job.
export const consumeGeneration = mutation({
  args: { prompt: v.optional(v.string()) },
  handler: async () => { throw new ConvexError('USE_REQUEST_GENERATION'); },
});

// Internal: credit a user after a verified payment (called by the Dodo webhook).
export const addCredits = internalMutation({
  args: { tokenIdentifier: v.string(), credits: v.number(), packId: v.string(), amountUsd: v.number(), reference: v.optional(v.string()), provider: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    const user = await ctx.db.query("users").withIndex("by_token", (q: any) => q.eq("tokenIdentifier", args.tokenIdentifier)).unique();
    if (!user) return; // unknown user — ignore
    await ctx.db.patch(user._id, { credits: user.credits + args.credits });
    await ctx.db.insert("purchases", {
      tokenIdentifier: args.tokenIdentifier, packId: args.packId, credits: args.credits,
      amountUsd: args.amountUsd, provider: args.provider ?? "dodo", reference: args.reference, at: Date.now(),
    });
  },
});
