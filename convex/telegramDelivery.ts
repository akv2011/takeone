declare const process: { env: Record<string, string | undefined> };
import { mutationGeneric as publicMutation, internalMutationGeneric as mutation, internalActionGeneric as action, makeFunctionReference as ref } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { dispatcher, owner } from './jobs';
const sendRef = ref<'action'>('telegramDelivery:send');
export const retry = publicMutation({ args: { jobId: v.id('genJobs') }, handler: async (ctx, { jobId }) => {
  const user = await owner(ctx), job = await ctx.db.get(jobId);
  if (!job || job.userId !== user.tokenIdentifier || job.status !== 'done' || !job.storageKey || !job.telegramChatId) throw new ConvexError('DELIVERY_UNAVAILABLE');
  const link = await ctx.db.query('telegramLinks').withIndex('by_user', q => q.eq('userId', user.tokenIdentifier)).unique();
  if (link?.telegramUserId !== job.telegramChatId) throw new ConvexError('TELEGRAM_LINK_CHANGED');
  if (['pending', 'sending', 'sent'].includes(job.telegramDeliveryStatus ?? '')) return;
  if (job.telegramDeliveryStatus !== 'failed') throw new ConvexError('DELIVERY_UNAVAILABLE');
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new ConvexError('TELEGRAM_UNCONFIGURED');
  if (job.telegramDeliveryRetriedAt !== undefined && Date.now() - job.telegramDeliveryRetriedAt < 60000) throw new ConvexError('DELIVERY_RETRY_TOO_SOON');
  await ctx.db.patch(jobId, { telegramDeliveryStatus: 'pending', telegramDeliveryLimit: (job.telegramDeliveryAttempt ?? 0) + 3, telegramDeliveryRetriedAt: Date.now(), telegramDeliveryExpiresAt: undefined });
  await ctx.scheduler.runAfter(0, sendRef, { jobId });
}});
export const claim = mutation({ args: { jobId: v.id('genJobs') }, handler: async (ctx: any, { jobId }: any) => {
  const job = await ctx.db.get(jobId);
  if (!job || job.status !== 'done' || job.telegramDeliveryStatus !== 'pending') return null;
  const link = await ctx.db.query('telegramLinks').withIndex('by_user', (q: any) => q.eq('userId', job.userId)).unique();
  if (!job.storageKey || !job.telegramChatId || link?.telegramUserId !== job.telegramChatId) { await ctx.db.patch(jobId, { telegramDeliveryStatus: 'failed', telegramDeliveryExpiresAt: undefined }); return null; }
  const attempt = (job.telegramDeliveryAttempt ?? 0) + 1;
  await ctx.db.patch(jobId, { telegramDeliveryStatus: 'sending', telegramDeliveryAttempt: attempt, telegramDeliveryStartedAt: Date.now(), telegramDeliveryExpiresAt: Date.now() + 120_000 });
  return { chatId: job.telegramChatId, storageKey: job.storageKey, attempt };
}});
export const finish = mutation({ args: { jobId: v.id('genJobs'), attempt: v.number(), success: v.boolean(), messageId: v.optional(v.number()) }, handler: async (ctx: any, args: any) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.telegramDeliveryStatus !== 'sending' || job.telegramDeliveryAttempt !== args.attempt) return;
  const status = args.success ? 'sent' : args.attempt >= (job.telegramDeliveryLimit ?? 3) ? 'failed' : 'pending';
  await ctx.db.patch(job._id, { telegramDeliveryStatus: status, telegramDeliveryExpiresAt: undefined, ...(args.success ? { telegramDeliveredAt: Date.now(), ...(Number.isSafeInteger(args.messageId) && args.messageId > 0 ? { telegramMessageId: args.messageId } : {}) } : {}) });
  recordDelivery(job, args.success);
  if (status === 'pending') await ctx.scheduler.runAfter(30_000, sendRef, { jobId: job._id });
}});
export const recover = mutation({ args: {}, handler: async (ctx: any) => {
  const jobs = await ctx.db.query('genJobs').withIndex('by_delivery', (q: any) => q.eq('telegramDeliveryStatus', 'sending')).take(100);
  for (const job of jobs) {
    if (job.telegramDeliveryExpiresAt > Date.now()) continue;
    const status = job.telegramDeliveryAttempt >= (job.telegramDeliveryLimit ?? 3) ? 'failed' : 'pending';
    await ctx.db.patch(job._id, { telegramDeliveryStatus: status });
    recordDelivery(job, false);
    if (status === 'pending') await ctx.scheduler.runAfter(0, sendRef, { jobId: job._id });
  }
}});
function recordDelivery(job: any, success: boolean) {
  const now = Date.now();
  const record = (stage: string, start: number | undefined) => {
    if (start === undefined) return;
    console.log(JSON.stringify({ event: 'takeone.stage', stage, jobId: job._id, attempt: job.telegramDeliveryAttempt, at: now, durationMs: Math.max(0, now - start), success }));
  };
  record('telegram_api_delivery', job.telegramDeliveryStartedAt);
  if (success) {
    record('telegram_after_render', job.finishedAt);
    record('telegram_total', job.createdAt);
  }
}
export const send = action({ args: { jobId: v.id('genJobs') }, handler: async (ctx: any, args: any) => {
  const delivery = await ctx.runMutation(ref<'mutation'>('telegramDelivery:claim'), args);
  if (!delivery) return;
  let success = false;
  let messageId: number | undefined;
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('Telegram not configured');
    const { url } = await (await dispatcher('sign', { storageKey: delivery.storageKey })).json();
    const response = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: delivery.chatId, video: url, caption: 'Your TakeOne video is ready. Reply to this video with trim, speed or framing instructions to create a new version (one generation). It is also saved in your dashboard.' }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json();
    success = response.ok && body.ok === true;
    if (success && Number.isSafeInteger(body.result?.message_id) && body.result.message_id > 0 && String(body.result?.chat?.id) === delivery.chatId) messageId = body.result.message_id;
  } catch { /* Delivery retries never debit allowance or re-render a finished video. */ }
  await ctx.runMutation(ref<'mutation'>('telegramDelivery:finish'), { ...args, attempt: delivery.attempt, success, messageId });
}});
