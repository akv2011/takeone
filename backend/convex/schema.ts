// Convex schema for the deployed version (B5). Run: npx convex dev
// The in-memory src/data/index.ts mirrors this so the app runs before Convex is provisioned.
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  jobs: defineTable({
    jobId: v.string(), userId: v.string(), mode: v.string(),
    status: v.string(), isPro: v.boolean(), inBytes: v.optional(v.number()),
    outBytes: v.optional(v.number()), ms: v.optional(v.number()),
  }).index('by_user', ['userId']),
  users: defineTable({
    userId: v.string(), platform: v.string(), handle: v.optional(v.string()),
    isPro: v.boolean(), refCode: v.optional(v.string()),
  }).index('by_userId', ['userId']),
  usage: defineTable({ userId: v.string(), day: v.string(), count: v.number() })
    .index('by_user_day', ['userId', 'day']),
});
