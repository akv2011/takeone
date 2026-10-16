'use node';
declare const process: { env: Record<string, string | undefined> };
import { internalActionGeneric as internalAction, makeFunctionReference as ref } from 'convex/server';
import { v } from 'convex/values';
import { recordPaymentDisputes } from './disputeSnapshot';
import { Webhook } from 'standardwebhooks';

export const receive = internalAction({
  args: { body: v.string(), headers: v.record(v.string(), v.string()) },
  handler: async (ctx, args): Promise<number> => {
    const secret = process.env.DODO_WEBHOOK_SECRET;
    const key = process.env.DODO_API_KEY;
    const environment = process.env.DODO_ENVIRONMENT;
    if (!secret || !key || !process.env.DODO_BUSINESS_ID || !['test', 'live'].includes(environment ?? '')) return 503;
    let event: any;
    try { event = new Webhook(secret).verify(args.body, args.headers); } catch { return 401; }
    const observedAt = Date.now();
    if (['dispute.opened', 'dispute.expired', 'dispute.accepted', 'dispute.cancelled', 'dispute.challenged', 'dispute.won', 'dispute.lost'].includes(event.type)) {
      const disputeId = event.data?.dispute_id;
      if (typeof disputeId !== 'string' || !disputeId || disputeId.length > 200) return 400;
      const response = await fetch(`https://${environment}.dodopayments.com/disputes/${encodeURIComponent(disputeId)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) return 503;
      const dispute = await response.json();
      if (dispute.dispute_id !== disputeId || typeof dispute.payment_id !== 'string') return 400;
      const paymentResponse = await fetch(`https://${environment}.dodopayments.com/payments/${encodeURIComponent(dispute.payment_id)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
      if (!paymentResponse.ok) return 503;
      const payment = await paymentResponse.json();
      if (payment.payment_id !== dispute.payment_id || typeof payment.metadata?.orderId !== 'string') return 400;
      await ctx.runMutation(ref<'mutation'>('payments:recoverPaidSession'), { orderId: payment.metadata.orderId, payment, environment });
      await ctx.runMutation(ref<'mutation'>('payments:recordDispute'), { orderId: payment.metadata.orderId, payment, dispute, environment, observedAt });
      return 200;
    }
    if (event.type === 'refund.succeeded') {
      const refundId = event.data?.refund_id;
      if (typeof refundId !== 'string' || !refundId) return 400;
      const refundResponse = await fetch(`https://${environment}.dodopayments.com/refunds/${encodeURIComponent(refundId)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
      if (!refundResponse.ok) return 503;
      const refund = await refundResponse.json();
      if (refund.refund_id !== refundId || typeof refund.payment_id !== 'string') return 400;
      if (refund.status !== 'succeeded') return 503;
      const paymentResponse = await fetch(`https://${environment}.dodopayments.com/payments/${encodeURIComponent(refund.payment_id)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
      if (!paymentResponse.ok) return 503;
      const payment = await paymentResponse.json();
      if (payment.payment_id !== refund.payment_id || typeof payment.metadata?.orderId !== 'string') return 400;
      await ctx.runMutation(ref<'mutation'>('payments:recoverPaidSession'), { orderId: payment.metadata.orderId, payment, environment });
      await recordPaymentDisputes(ctx, payment, environment!, observedAt);
      await ctx.runMutation(ref<'mutation'>('payments:applyRefund'), { orderId: payment.metadata.orderId, payment, refund, environment });
      return 200;
    }
    if (!['payment.succeeded', 'payment.processing', 'payment.failed', 'payment.cancelled'].includes(event.type)) return 200;
    const paymentId = event.data?.payment_id;
    if (typeof paymentId !== 'string' || !paymentId) return 400;
    // Fetch canonical details rather than granting credits from webhook metadata.
    const response = await fetch(`https://${environment}.dodopayments.com/payments/${encodeURIComponent(paymentId)}`, {
      headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return 503;
    const payment = await response.json();
    if (payment.payment_id !== paymentId || typeof payment.metadata?.orderId !== 'string') return 400;
    if (payment.status === 'succeeded') {
      await ctx.runMutation(ref<'mutation'>('payments:recoverPaidSession'), { orderId: payment.metadata.orderId, payment, environment });
      await recordPaymentDisputes(ctx, payment, environment!, observedAt);
      const refund = payment.refunds?.find((r: any) => r.status === 'succeeded');
      if (refund) await ctx.runMutation(ref<'mutation'>('payments:applyRefund'), { orderId: payment.metadata.orderId, payment, refund, environment });
      else if (payment.disputes?.length) return 200; // Observation accepted; fulfillment awaits review.
      else await ctx.runMutation(ref<'mutation'>('payments:fulfill'), { orderId: payment.metadata.orderId, payment, environment });
    } else {
      const observedAt = Date.parse(event.timestamp);
      if (!Number.isFinite(observedAt)) return 400;
      await ctx.runMutation(ref<'mutation'>('payments:recordStatus'), { orderId: payment.metadata.orderId, payment, environment, observedAt });
    }
    return 200;
  },
});
