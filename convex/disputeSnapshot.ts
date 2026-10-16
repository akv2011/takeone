import { makeFunctionReference } from 'convex/server';

/** Store verified provider observations before any independent credit mutation. */
export async function recordPaymentDisputes(ctx: any, payment: any, environment: string, observedAt: number) {
  if (payment.disputes === undefined) return; // Older provider fixtures/snapshots.
  if (!Array.isArray(payment.disputes) || payment.disputes.length > 100) throw new Error('Invalid dispute snapshot');
  const seen = new Set();
  for (const dispute of payment.disputes) {
    if (!dispute || seen.has(dispute.dispute_id)) throw new Error('Invalid dispute snapshot');
    seen.add(dispute.dispute_id);
    await ctx.runMutation(makeFunctionReference<'mutation'>('payments:recordDispute'), { orderId: payment.metadata?.orderId, payment, dispute, environment, observedAt });
  }
}
