declare const process: { env: Record<string, string | undefined> };
import { internalMutationGeneric as mutation, internalActionGeneric as action, makeFunctionReference as ref } from 'convex/server';
import { v } from 'convex/values';

// Called inside the webhook transaction so update deduplication and reply creation
// commit together. These messages never change video jobs or user balances.
export async function queueReply(ctx: any, chatId: string, text: string) {
  const now = Date.now();
  const messageId = await ctx.db.insert('telegramMessages', { chatId, text, status: 'pending', attempts: 0, createdAt: now, expiresAt: now + 600000, nextAt: now });
  await ctx.scheduler.runAfter(0, ref<'action'>('telegramMessages:deliver'), { messageId });
}
export const claim = mutation({ args: { messageId: v.id('telegramMessages') }, handler: async (ctx, { messageId }) => {
  const row = await ctx.db.get(messageId);
  if (!row || !['pending', 'sending'].includes(row.status) || row.nextAt > Date.now()) return null;
  if (row.expiresAt <= Date.now() || row.attempts >= 3 || !row.text) {
    await ctx.db.patch(messageId, { status: 'failed', text: undefined, error: row.expiresAt <= Date.now() ? 'expired' : 'attempts_exhausted' });
    return null;
  }
  const attempt = row.attempts + 1;
  await ctx.db.patch(messageId, { status: 'sending', attempts: attempt, nextAt: Date.now() + 60000 });
  return { chatId: row.chatId, text: row.text, attempt };
}});
export const finish = mutation({ args: { messageId: v.id('telegramMessages'), attempt: v.number(), success: v.boolean(), permanent: v.optional(v.boolean()), retryAfterSec: v.optional(v.number()), providerMessageId: v.optional(v.number()) }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.messageId);
  if (!row || row.status !== 'sending' || row.attempts !== args.attempt) return;
  if (args.success) {
    await ctx.db.patch(row._id, { status: 'sent', text: undefined, error: undefined, deliveredAt: Date.now(), messageId: args.providerMessageId });
    return;
  }
  const delay = Math.max(30 * args.attempt, Number.isFinite(args.retryAfterSec) ? Math.max(0, args.retryAfterSec!) : 0) * 1000;
  const nextAt = Date.now() + delay;
  if (args.permanent || row.attempts >= 3 || nextAt >= row.expiresAt) {
    await ctx.db.patch(row._id, { status: 'failed', text: undefined, error: args.permanent ? 'recipient_rejected' : 'delivery_failed' });
    return;
  }
  await ctx.db.patch(row._id, { status: 'pending', nextAt, error: 'retry_pending' });
  await ctx.scheduler.runAfter(delay, ref<'action'>('telegramMessages:deliver'), { messageId: row._id });
}});
export const deliver = action({ args: { messageId: v.id('telegramMessages') }, handler: async (ctx, args) => {
  const row = await ctx.runMutation(ref<'mutation'>('telegramMessages:claim'), args);
  if (!row) return;
  let success = false, permanent = false;
  let retryAfterSec: number | undefined, providerMessageId: number | undefined;
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw Error('not configured');
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: row.chatId, text: row.text }), signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    success = response.ok && body.ok === true;
    permanent = response.status === 403 || body.error_code === 403;
    if (Number.isSafeInteger(body.parameters?.retry_after) && body.parameters.retry_after >= 0) retryAfterSec = body.parameters.retry_after;
    if (success && Number.isSafeInteger(body.result?.message_id)) providerMessageId = body.result.message_id;
  } catch { /* Never persist/log token-bearing URLs or raw provider responses. */ }
  await ctx.runMutation(ref<'mutation'>('telegramMessages:finish'), { ...args, attempt: row.attempt, success, permanent, retryAfterSec, providerMessageId });
}});
export const recover = mutation({ args: {}, handler: async ctx => {
  for (const status of ['pending', 'sending']) {
    const rows = await ctx.db.query('telegramMessages').withIndex('by_status_next', (q: any) => q.eq('status', status).lte('nextAt', Date.now())).take(50);
    for (const row of rows) await ctx.scheduler.runAfter(0, ref<'action'>('telegramMessages:deliver'), { messageId: row._id });
  }
}});
