import { queryGeneric as query, mutationGeneric as mutation, internalMutationGeneric as internalMutation } from "convex/server";
import { ConvexError, v } from "convex/values";
import { FREE_LIMIT, FOUNDING_CREDITS } from "./config.js";

export const currentUser = query({
  args: {},
  handler: async (ctx: any) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) return null;
    const user = await ctx.db.query("users").withIndex("by_token", (q: any) => q.eq("tokenIdentifier", id.subject)).unique();
    const freeUsed = user?.freeUsed ?? 0;
    const credits = user?.credits ?? 0;
    return {
      email: user?.email ?? id.email,
      name: user?.name ?? id.name,
      founding: !!user?.founding,
      credits: Math.max(0, credits),
      creditAdjustment: Math.max(0, -credits),
      freeUsed,
      freeLimit: FREE_LIMIT,
      freeRemaining: Math.max(0, FREE_LIMIT - freeUsed),
      canGenerate: freeUsed < FREE_LIMIT || credits > 0,
      preferences: {
        defaultMode: user?.defaultMode ?? "generate",
        defaultAspect: user?.defaultAspect ?? "9:16",
        defaultCaptionStyle: user?.defaultCaptionStyle ?? "auto",
        openFinishedInStudio: user?.openFinishedInStudio ?? true,
        showShortcutHints: user?.showShortcutHints ?? true,
      },
    };
  },
});

export const updatePreferences = mutation({
  args: {
    defaultMode: v.union(v.literal("edit"), v.literal("generate"), v.literal("clip")),
    defaultAspect: v.union(v.literal("9:16"), v.literal("1:1"), v.literal("16:9")),
    defaultCaptionStyle: v.union(v.literal("auto"), v.literal("clean"), v.literal("meme"), v.literal("karaoke"), v.literal("none")),
    openFinishedInStudio: v.boolean(),
    showShortcutHints: v.boolean(),
  },
  handler: async (ctx: any, args: any) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("UNAUTHENTICATED");
    const user = await ctx.db.query("users").withIndex("by_token", (q: any) => q.eq("tokenIdentifier", identity.subject)).unique();
    if (!user) throw new ConvexError("USER_NOT_FOUND");
    await ctx.db.patch(user._id, args);
    return args;
  },
});

// Called on sign-in. Creates the user row; if their email was on the waitlist,
// they become a Founding Creator and get bonus credits (moves waitlist -> users).
export const ensureUser = mutation({
  args: { email: v.optional(v.string()), name: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) throw new Error("not authenticated");
    const existing = await ctx.db.query("users").withIndex("by_token", (q: any) => q.eq("tokenIdentifier", id.subject)).unique();
    if (existing) return existing._id;

    const email = (id.email ?? "").trim().toLowerCase();

    // Claim a pre-migrated waitlist row (tokenIdentifier "waitlist:<email>") instead of duplicating.
    const byEmail = email
      ? await ctx.db.query("users").withIndex("by_email", (q: any) => q.eq("email", email)).unique()
      : null;
    if (byEmail?.tokenIdentifier === `waitlist:${email}`) {
      await ctx.db.patch(byEmail._id, { tokenIdentifier: id.subject, name: args.name ?? id.name ?? byEmail.name });
      return byEmail._id;
    }

    const onWaitlist = email
      ? await ctx.db.query("waitlist").withIndex("by_email", (q: any) => q.eq("email", email)).unique()
      : null;
    const founding = !!onWaitlist;

    return ctx.db.insert("users", {
      tokenIdentifier: id.subject,
      email: email || undefined,
      name: args.name ?? id.name,
      credits: founding ? FOUNDING_CREDITS : 0,
      freeUsed: 0,
      founding,
    });
  },
});

// One-off: create a users row for every waitlist email (Founding Creators). Idempotent.
// Run: npx convex run users:migrateWaitlistToUsers --prod
export const migrateWaitlistToUsers = internalMutation({
  args: {},
  handler: async (ctx: any) => {
    const wl = await ctx.db.query("waitlist").collect();
    const users = await ctx.db.query("users").collect();
    const have = new Set(users.map((u: any) => (u.email ?? "").toLowerCase()));
    let migrated = 0;
    for (const w of wl) {
      const e = String(w.email ?? "").trim().toLowerCase();
      if (!e || have.has(e)) continue;
      await ctx.db.insert("users", {
        tokenIdentifier: `waitlist:${e}`,
        email: e,
        credits: FOUNDING_CREDITS,
        freeUsed: 0,
        founding: true,
      });
      have.add(e);
      migrated++;
    }
    return { migrated, totalUsers: users.length + migrated };
  },
});
