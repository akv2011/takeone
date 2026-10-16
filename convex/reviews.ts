import { v, ConvexError } from 'convex/values';
import { actionGeneric as action, queryGeneric as query, mutationGeneric as mutation, internalMutationGeneric as internalMutation, internalQueryGeneric as internalQuery, makeFunctionReference as ref } from 'convex/server';
import { dispatcher } from './jobs';
import { feedbackSummaryValidator } from './feedbackValues';

const TOKEN = /^[a-f0-9]{64}$/;
const VIDEO = /^videos\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.mp4$/;
const HOUR = 3_600_000;
const controlText = (value: string, multiline = false) => Array.from(value).some(character => {
  const code = character.charCodeAt(0);
  return code === 127 || code < 32 && !(multiline && (code === 9 || code === 10));
});
const managedVideo = (job: any) => typeof job.storageKey === 'string' && VIDEO.test(job.storageKey) && job.storageKey.startsWith(`videos/${job._id}/`);
export async function tokenHash(token: string) {
  if (!TOKEN.test(token)) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}
async function identity(ctx: any) {
  const auth = await ctx.auth.getUserIdentity();
  if (!auth) throw new ConvexError('UNAUTHENTICATED');
  return auth.subject as string;
}
async function validLink(ctx: any, hash: string | null) {
  if (!hash) return null;
  const link = await ctx.db.query('reviewLinks').withIndex('by_token', (q: any) => q.eq('tokenHash', hash)).unique();
  if (!link || link.revokedAt !== undefined || link.expiresAt <= Date.now()) return null;
  const job = await ctx.db.get(link.jobId);
  return job?.userId === link.userId && job.status === 'done' && job.storageKey === link.storageKey && managedVideo(job) ? link : null;
}
const summaryRow = (ctx: any, jobId: any) => ctx.db.query('feedbackSummaries').withIndex('by_job', (q: any) => q.eq('jobId', jobId)).unique();
const commentView = (row: any) => ({ id: row._id, name: row.name, text: row.text, at: row.at, createdAt: row.createdAt, resolved: row.resolved });
async function comments(ctx: any, reviewId: any) {
  return (await ctx.db.query('reviewComments').withIndex('by_review', (q: any) => q.eq('reviewId', reviewId)).take(200)).map(commentView);
}
const createArgs = { jobId: v.id('genJobs'), durationSec: v.number(), days: v.union(v.literal(1), v.literal(7)) };
export const create = action({ args: createArgs, handler: async (ctx, args): Promise<{ id: string; token: string; expiresAt: number }> => {
  await identity(ctx);
  // Action randomness is cryptographic; only the digest reaches the database.
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  const result = await ctx.runMutation(ref<'mutation'>('reviews:store'), { ...args, tokenHash: await tokenHash(token) });
  return { ...result, token };
}});
export const store = internalMutation({ args: { ...createArgs, tokenHash: v.string() }, handler: async (ctx, args) => {
  const userId = await identity(ctx), job = await ctx.db.get(args.jobId);
  if (!job || job.userId !== userId || job.status !== 'done' || !managedVideo(job)) throw new ConvexError('VIDEO_UNAVAILABLE');
  if (!TOKEN.test(args.tokenHash) || !Number.isFinite(args.durationSec) || args.durationSec <= 0 || args.durationSec > 300.1) throw new ConvexError('INVALID_REVIEW');
  const now = Date.now();
  const existing = await ctx.db.query('reviewLinks').withIndex('by_user_created', q => q.eq('userId', userId)).order('desc').take(100);
  if (existing.length >= 100) throw new ConvexError('REVIEW_HISTORY_FULL');
  const quota = await ctx.db.query('reviewCreators').withIndex('by_user', q => q.eq('userId', userId)).unique();
  const count = quota && quota.windowAt > now - HOUR ? quota.count : 0;
  if (count >= 5) throw new ConvexError('REVIEW_CREATE_LIMIT');
  const windowAt = count ? quota!.windowAt : now;
  if (quota) await ctx.db.patch(quota._id, { windowAt, count: count + 1 });
  else await ctx.db.insert('reviewCreators', { userId, windowAt, count: 1 });
  if (await ctx.db.query('reviewLinks').withIndex('by_token', q => q.eq('tokenHash', args.tokenHash)).unique()) throw new ConvexError('REVIEW_RETRY');
  // One live capability for this exact version; another version is untouched.
  for (const link of existing) if (link.jobId === args.jobId && link.revokedAt === undefined && link.expiresAt > now) await ctx.db.patch(link._id, { revokedAt: now });
  const expiresAt = now + args.days * 24 * HOUR;
  const id = await ctx.db.insert('reviewLinks', { userId, jobId: job._id, storageKey: job.storageKey, tokenHash: args.tokenHash, durationSec: args.durationSec, createdAt: now, expiresAt, commentCount: 0 });
  return { id, expiresAt };
}});
export const list = query({ args: { jobId: v.string() }, handler: async (ctx, { jobId }) => {
  const userId = await identity(ctx), id = ctx.db.normalizeId('genJobs', jobId), job = id ? await ctx.db.get(id) : null;
  if (!job || job.userId !== userId) return [];
  const links = await ctx.db.query('reviewLinks').withIndex('by_job_created', q => q.eq('jobId', job._id)).order('desc').take(100);
  return links.map(link => ({ id: link._id, createdAt: link.createdAt, expiresAt: link.expiresAt, revokedAt: link.revokedAt, commentCount: link.commentCount }));
}});
export const feedback = query({ args: { reviewId: v.id('reviewLinks') }, handler: async (ctx, { reviewId }) => {
  const userId = await identity(ctx), link = await ctx.db.get(reviewId);
  if (!link || link.userId !== userId) return null;
  return comments(ctx, reviewId);
}});
export const revoke = mutation({ args: { reviewId: v.id('reviewLinks') }, handler: async (ctx, { reviewId }) => {
  const userId = await identity(ctx), link = await ctx.db.get(reviewId);
  if (!link || link.userId !== userId) throw new ConvexError('REVIEW_UNAVAILABLE');
  if (link.revokedAt === undefined) await ctx.db.patch(reviewId, { revokedAt: Date.now() });
}});
export const remove = mutation({ args: { reviewId: v.id('reviewLinks') }, handler: async (ctx, { reviewId }) => {
  const userId = await identity(ctx), link = await ctx.db.get(reviewId);
  if (!link || link.userId !== userId) throw new ConvexError('REVIEW_UNAVAILABLE');
  if (link.revokedAt === undefined && link.expiresAt > Date.now()) throw new ConvexError('REVOKE_FIRST');
  const deleted = new Set<string>();
  for (const row of await ctx.db.query('reviewComments').withIndex('by_review', q => q.eq('reviewId', reviewId)).take(200)) { await ctx.db.delete(row._id); deleted.add(row._id); }
  await ctx.db.delete(reviewId);
  const summary = await summaryRow(ctx, link.jobId);
  if (summary?.result?.notes.some((note: { id: string }) => deleted.has(note.id))) await ctx.db.patch(summary._id, { result: undefined });
}});
interface SummaryNote { id: string; at: number; text: string }
export const summarize = action({ args: { jobId: v.id('genJobs') }, handler: async (ctx, { jobId }): Promise<void> => {
  await identity(ctx);
  const notes: SummaryNote[] = await ctx.runMutation(ref<'mutation'>('reviews:reserveSummary'), { jobId });
  let data: any;
  try { data = await (await dispatcher('summarize-feedback', { versionId: jobId, notes }, 30_000)).json(); } catch { throw new ConvexError('SUMMARY_UNAVAILABLE'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.themes) || !Array.isArray(data.notes)) throw new ConvexError('SUMMARY_UNAVAILABLE');
  // Each sent id joins once and all must come back, so the reply cannot name a note this call did not send.
  const pending = new Map(notes.map(note => [note.id, note.at]));
  const joined = data.notes.map((note: any) => {
    const at = pending.get(note?.id);
    if (at === undefined) throw new ConvexError('SUMMARY_UNAVAILABLE');
    pending.delete(note.id);
    return { id: note.id, at, sentiment: note.sentiment };
  });
  if (pending.size) throw new ConvexError('SUMMARY_UNAVAILABLE');
  await ctx.runMutation(ref<'mutation'>('reviews:storeSummary'), { jobId, sentiment: data.sentiment, why: data.why, themes: data.themes, notes: joined });
}});
export const reserveSummary = internalMutation({ args: { jobId: v.id('genJobs') }, handler: async (ctx, { jobId }): Promise<SummaryNote[]> => {
  const userId = await identity(ctx), job = await ctx.db.get(jobId);
  if (!job || job.userId !== userId) throw new ConvexError('REVIEW_UNAVAILABLE');
  const notes: SummaryNote[] = [];
  for (const link of await ctx.db.query('reviewLinks').withIndex('by_job_created', q => q.eq('jobId', jobId)).order('desc').take(100)) {
    for (const row of await ctx.db.query('reviewComments').withIndex('by_review', q => q.eq('reviewId', link._id)).take(200 - notes.length)) notes.push({ id: row._id, at: row.at, text: row.text });
    if (notes.length >= 200) break;
  }
  if (notes.length < 3) throw new ConvexError('SUMMARY_NEEDS_NOTES');
  const now = Date.now(), row = await summaryRow(ctx, jobId);
  const count = row && row.windowAt > now - HOUR ? row.windowCount : 0;
  if (count >= 3) throw new ConvexError('SUMMARY_RATE_LIMIT');
  const windowAt = count ? row.windowAt : now;
  if (row) await ctx.db.patch(row._id, { windowAt, windowCount: count + 1 });
  else await ctx.db.insert('feedbackSummaries', { userId, jobId, windowAt, windowCount: 1 });
  return notes;
}});
export const storeSummary = internalMutation({ args: { jobId: v.id('genJobs'), ...feedbackSummaryValidator.omit('noteCount', 'createdAt').fields }, handler: async (ctx, { jobId, ...summary }) => {
  const userId = await identity(ctx), job = await ctx.db.get(jobId), row = await summaryRow(ctx, jobId);
  if (!job || job.userId !== userId || !row) throw new ConvexError('REVIEW_UNAVAILABLE');
  if (!summary.why.trim() || summary.why.length > 200 || !summary.themes.length || summary.themes.length > 3 || summary.themes.some(theme => !theme.trim() || theme.length > 80) || !summary.notes.length) throw new ConvexError('SUMMARY_UNAVAILABLE');
  for (const note of summary.notes) if (!await ctx.db.get(note.id)) throw new ConvexError('SUMMARY_STALE');
  await ctx.db.patch(row._id, { result: { ...summary, noteCount: summary.notes.length, createdAt: Date.now() } });
}});
export const summary = query({ args: { jobId: v.string() }, handler: async (ctx, { jobId }) => {
  const auth = await ctx.auth.getUserIdentity(), id = ctx.db.normalizeId('genJobs', jobId), job = id ? await ctx.db.get(id) : null;
  if (!auth || !job || job.userId !== auth.subject) return null;
  return (await summaryRow(ctx, job._id))?.result ?? null;
}});
export const resolve = mutation({ args: { commentId: v.id('reviewComments'), resolved: v.boolean() }, handler: async (ctx, { commentId, resolved }) => {
  const userId = await identity(ctx), comment = await ctx.db.get(commentId), link = comment ? await ctx.db.get(comment.reviewId) : null;
  if (!link || link.userId !== userId) throw new ConvexError('REVIEW_UNAVAILABLE');
  await ctx.db.patch(commentId, { resolved });
}});
export const get = query({ args: { token: v.string() }, handler: async (ctx, { token }) => {
  const link = await validLink(ctx, await tokenHash(token));
  return link ? { expiresAt: link.expiresAt, durationSec: link.durationSec, comments: await comments(ctx, link._id) } : null;
}});
export const addComment = mutation({ args: { token: v.string(), requestId: v.string(), name: v.string(), text: v.string(), at: v.number() }, handler: async (ctx, args) => {
  const link = await validLink(ctx, await tokenHash(args.token));
  if (!link) throw new ConvexError('REVIEW_UNAVAILABLE');
  const name = args.name.trim(), text = args.text.trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(args.requestId) || !name || name.length > 60 || !text || text.length > 1000 || controlText(name) || controlText(text, true) || !Number.isFinite(args.at) || args.at < 0 || args.at > link.durationSec) throw new ConvexError('INVALID_COMMENT');
  const previous = await ctx.db.query('reviewComments').withIndex('by_request', (q: any) => q.eq('reviewId', link._id).eq('requestId', args.requestId)).unique();
  if (previous) {
    if (previous.name !== name || previous.text !== text || previous.at !== args.at) throw new ConvexError('COMMENT_RETRY_CHANGED');
    return previous._id;
  }
  const now = Date.now(), reset = (link.commentWindowAt ?? 0) <= now - 60_000;
  const count = reset ? 0 : link.commentWindowCount ?? 0;
  if (link.commentCount >= 200) throw new ConvexError('REVIEW_FULL');
  if (count >= 10) throw new ConvexError('COMMENT_RATE_LIMIT');
  await ctx.db.patch(link._id, { commentCount: link.commentCount + 1, commentWindowAt: reset ? now : link.commentWindowAt, commentWindowCount: count + 1 });
  return ctx.db.insert('reviewComments', { reviewId: link._id, requestId: args.requestId, name, text, at: args.at, createdAt: now, resolved: false });
}});
export const reservePlayback = internalMutation({ args: { hash: v.string() }, handler: async (ctx, { hash }) => {
  const link = await validLink(ctx, TOKEN.test(hash) ? hash : null);
  if (!link) return null;
  const now = Date.now(), reset = (link.signWindowAt ?? 0) <= now - 60_000;
  const count = reset ? 0 : link.signWindowCount ?? 0;
  if (count >= 20) throw new ConvexError('PLAYBACK_RATE_LIMIT');
  await ctx.db.patch(link._id, { signWindowAt: reset ? now : link.signWindowAt, signWindowCount: count + 1 });
  return { storageKey: link.storageKey, expiresAt: link.expiresAt };
}});
export const checkPlayback = internalQuery({ args: { hash: v.string(), storageKey: v.string() }, handler: async (ctx, { hash, storageKey }) => {
  const link = await validLink(ctx, TOKEN.test(hash) ? hash : null);
  return link?.storageKey === storageKey;
}});
export const playback = action({ args: { token: v.string() }, handler: async (ctx, { token }): Promise<{ url: string; expiresAt: number }> => {
  const hash = await tokenHash(token);
  if (!hash) throw new ConvexError('REVIEW_UNAVAILABLE');
  const link = await ctx.runMutation(ref<'mutation'>('reviews:reservePlayback'), { hash });
  if (!link) throw new ConvexError('REVIEW_UNAVAILABLE');
  const startedAt = Date.now();
  const response = await dispatcher('sign-review', { storageKey: link.storageKey });
  const data = await response.json();
  if (!data || typeof data.url !== 'string' || !data.url.startsWith('https://')) throw new ConvexError('PLAYBACK_UNAVAILABLE');
  // A revoke racing the signing request must not return a fresh URL.
  if (!await ctx.runQuery(ref<'query'>('reviews:checkPlayback'), { hash, storageKey: link.storageKey })) throw new ConvexError('REVIEW_UNAVAILABLE');
  return { url: data.url, expiresAt: Math.min(link.expiresAt, startedAt + 120_000) };
}});
