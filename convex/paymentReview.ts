import { internalQueryGeneric as query, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

const environment = v.union(v.literal('test'), v.literal('live'));
const kind = v.union(v.literal('disputes'), v.literal('missing_session'), v.literal('provider_failure'));
const errorFor = { missing_session: 'missing_session_review_required', provider_failure: 'provider_check_failed' };
function boundPage(size: number) {
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new ConvexError('REVIEW_PAGE_SIZE');
}
/** Deliberately omit account identities, checkout URLs and raw provider error strings. */
function project(order: any) {
  return { orderId: order._id, environment: order.environment, packId: order.packId,
    status: order.status, createdAt: order.createdAt, creditsPurchased: order.credits,
    creditsRefunded: order.refundedCredits ?? 0, amountMinorUsd: order.amountMinor,
    capturedMinorUsd: order.paidTotalMinor, refundedMinorUsd: order.refundedAmountMinor ?? 0,
    disputeReview: order.disputeReview === true, hasSession: !!order.sessionId,
    hasPayment: !!order.paymentId, reconciledAt: order.reconciledAt,
    nextReconcileAt: order.nextReconcileAt,
    reconciliationIssue: order.reconcileError === errorFor.missing_session ? 'missing_session'
      : order.reconcileError === errorFor.provider_failure ? 'provider_failure' : undefined };
}

/** Requires deployment/operator access; never expose through a public wrapper. */
export const list = query({ args: { environment, kind, paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  boundPage(args.paginationOpts.numItems);
  const selectedKind = args.kind;
  const orders = selectedKind === 'disputes'
    ? ctx.db.query('checkoutOrders').withIndex('by_environment_dispute_created', (q: any) => q.eq('environment', args.environment).eq('disputeReview', true))
    : ctx.db.query('checkoutOrders').withIndex('by_environment_error_created', (q: any) => q.eq('environment', args.environment).eq('reconcileError', errorFor[selectedKind]));
  const page = await orders.order('asc').paginate(args.paginationOpts);
  return { ...page, observedAt: Date.now(), page: page.page.map(project) };
}});

export const detail = query({ args: { environment, orderId: v.id('checkoutOrders') }, handler: async (ctx, args) => {
  const order = await ctx.db.get(args.orderId);
  if (!order || order.environment !== args.environment) return null;
  return { observedAt: Date.now(), source: 'saved_observations', automaticResolutionAvailable: false,
    order: { ...project(order), sessionId: order.sessionId, paymentId: order.paymentId,
      statusObservedAt: order.statusObservedAt, reconcileAttempt: order.reconcileAttempt ?? 0,
      reconcileRunning: order.reconcileRunning === true } };
}});

export const disputes = query({ args: { environment, orderId: v.id('checkoutOrders'), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => {
  boundPage(args.paginationOpts.numItems);
  const order = await ctx.db.get(args.orderId);
  if (!order || order.environment !== args.environment) throw new ConvexError('REVIEW_ORDER_UNAVAILABLE');
  const page = await ctx.db.query('paymentDisputes').withIndex('by_order', q => q.eq('orderId', order._id)).order('asc').paginate(args.paginationOpts);
  // A mismatched historical row is an integrity failure, never evidence for another environment.
  if (page.page.some(row => row.environment !== args.environment || (order.paymentId && row.paymentId !== order.paymentId))) throw new ConvexError('REVIEW_DISPUTE_BINDING');
  return { ...page, observedAt: Date.now(), source: 'saved_observations', amountUnits: 'unverified_provider_units', page: page.page.map(row => ({
    reference: row.reference, paymentId: row.paymentId, providerAmountRaw: row.amount,
    currency: row.currency, status: row.status, stage: row.stage,
    providerCreatedAt: row.providerCreatedAt, observedAt: row.observedAt,
  })) };
}});
