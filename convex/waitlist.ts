import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

// Vanity base so the first real signup doesn't read as "#1".
const BASE = 1400;
const sendWelcome = makeFunctionReference<"action">("email:sendWelcome");

export const join = mutation({
  args: { email: v.string(), source: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    const email = String(args.email).trim().toLowerCase();
    const existing = await ctx.db.query("waitlist").withIndex("by_email", (q: any) => q.eq("email", email)).unique();
    if (existing) return { position: existing.position, already: true };
    const all = await ctx.db.query("waitlist").collect();
    const position = BASE + all.length + 1;
    await ctx.db.insert("waitlist", { email, source: args.source, position, at: Date.now() });
    // fire-and-forget welcome email (no-op until RESEND_API_KEY is set)
    await ctx.scheduler.runAfter(0, sendWelcome, { email, position });
    return { position, already: false };
  },
});

export const count = query({
  args: {},
  handler: async (ctx: any) => BASE + (await ctx.db.query("waitlist").collect()).length,
});
