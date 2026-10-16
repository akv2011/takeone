import { UNSETTLED_PAYMENT_STATES, RESUMABLE_PAYMENT_STATES } from './paymentStates';
import { recordPaymentDisputes } from './disputeSnapshot';
declare const process: { env: Record<string, string | undefined> };
import { actionGeneric as action, internalActionGeneric as internalAction, internalQueryGeneric as internalQuery, internalMutationGeneric as internalMutation, queryGeneric as query, makeFunctionReference as ref, paginationOptsValidator } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { packById } from './config.js';

export const createCheckout = action({
  args: { packId: v.string(), returnUrl: v.string(), requestId: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError('UNAUTHENTICATED');
    if (!/^[\w-]{8,100}$/.test(args.requestId)) throw new ConvexError('INVALID_REQUEST_ID');
    const pack = packById(args.packId);
    if (!pack) throw new ConvexError('BAD_PACK');
    const key = process.env.DODO_API_KEY;
    const productId = process.env[`DODO_PRODUCT_${pack.id.toUpperCase()}`];
    const environment = process.env.DODO_ENVIRONMENT;
    const appUrl = process.env.APP_URL;
    if (process.env.DODO_CHECKOUT_ENABLED !== 'true' || !key || !productId || !appUrl || !process.env.DODO_WEBHOOK_SECRET || !process.env.DODO_BUSINESS_ID || !['test', 'live'].includes(environment ?? '')) {
      throw new ConvexError('PAYMENTS_UNCONFIGURED');
    }
    // The browser cannot choose the destination or the purchased credit amount.
    const origin = new URL(appUrl!).origin;
    const orderId = await ctx.runMutation(ref<'mutation'>('payments:createOrder'), {
      userId: identity.subject, packId: pack.id, productId, environment: environment!, requestId: args.requestId,
    });
    const attempt = await ctx.runMutation(ref<'mutation'>('payments:claimCheckout'), { orderId });
    if (attempt.url) return { url: attempt.url };
    if (!attempt.claimed) throw new ConvexError('CHECKOUT_PENDING');
    const response = await fetch(`https://${environment}.dodopayments.com/checkouts`, {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ product_cart: [{ product_id: productId, quantity: 1 }], billing_currency: 'USD',
        return_url: `${origin}/pricing?order=${orderId}`, cancel_url: `${origin}/pricing?order=${orderId}&cancelled=1`,
        metadata: { orderId },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      if ([400, 401, 403, 404, 422].includes(response.status)) await ctx.runMutation(ref<'mutation'>('payments:releaseCheckout'), { orderId });
      throw new ConvexError('CHECKOUT_FAILED');
    }
    const data = await response.json();
    if (typeof data.checkout_url !== 'string' || new URL(data.checkout_url).protocol !== 'https:' || typeof data.session_id !== 'string') throw new ConvexError('CHECKOUT_FAILED');
    await ctx.runMutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: data.session_id, checkoutUrl: data.checkout_url });
    return { url: data.checkout_url };
  },
});

export const createOrder = internalMutation({
  args: { userId: v.string(), packId: v.string(), productId: v.string(), environment: v.string(), requestId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', args.userId)).unique();
    const pack = packById(args.packId);
    if (!user || !pack) throw new ConvexError('ACCOUNT_NOT_READY');
    if (args.requestId) {
      if (!/^[\w-]{8,100}$/.test(args.requestId)) throw new ConvexError('INVALID_REQUEST_ID');
      const existing = await ctx.db.query('checkoutOrders').withIndex('by_request', (q: any) => q.eq('userId', args.userId).eq('requestId', args.requestId)).unique();
      if (existing) {
        if (existing.packId !== args.packId || existing.productId !== args.productId || existing.environment !== args.environment) throw new ConvexError('CHECKOUT_REQUEST_CONFLICT');
        return existing._id;
      }
    }
    return await ctx.db.insert('checkoutOrders', { ...args, credits: pack.credits, amountMinor: Math.round(pack.amountUsd * 100), status: 'pending', createdAt: Date.now(), nextReconcileAt: Date.now() + 300000 });
  },
});
export const attachSession = internalMutation({
  args: { orderId: v.id('checkoutOrders'), sessionId: v.string(), checkoutUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order || (order.sessionId && order.sessionId !== args.sessionId)) throw new Error('Invalid checkout session');
    await ctx.db.patch(args.orderId, { sessionId: args.sessionId, checkoutUrl: args.checkoutUrl, checkoutCreating: false });
  },
});
export const orderStatus = query({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const normalized = ctx.db.normalizeId('checkoutOrders', args.orderId);
    const order = normalized ? await ctx.db.get(normalized) : null;
    if (!identity || !order || order.userId !== identity.subject) return null;
    return { disputeReview: order.disputeReview, status: order.status, credits: order.credits, refundedCredits: order.refundedCredits, packId: order.packId, requestId: order.requestId };
  },
});

function validateCapturedPayment(order: any, p: any, environment: string, orderId: string) {
    if (order.paidTotalMinor !== undefined && order.paidTotalMinor !== p.total_amount) throw new Error('Payment total changed');
    const tax = p.tax ?? 0;
    if (p.status !== 'succeeded' || p.business_id !== process.env.DODO_BUSINESS_ID ||
        environment !== order.environment || p.checkout_session_id !== order.sessionId || p.metadata?.orderId !== orderId ||
        p.currency !== 'USD' || !Number.isSafeInteger(p.total_amount) || !Number.isSafeInteger(tax) || tax < 0 ||
        p.total_amount - tax !== order.amountMinor || typeof p.payment_id !== 'string' || !p.payment_id ||
        p.product_cart?.length !== 1 || p.product_cart[0].product_id !== order.productId || p.product_cart[0].quantity !== 1) throw new Error('Payment does not match order');
}

// Only a signed webhook's canonical captured payment can repair a lost create response.
export const recoverPaidSession = internalMutation({
  args: { orderId: v.id('checkoutOrders'), payment: v.any(), environment: v.string() },
  handler: async (ctx, { orderId, payment, environment }) => {
    const order = await ctx.db.get(orderId);
    if (!order) throw new Error('Checkout not ready');
    if (order.sessionId) {
      if (order.sessionId !== payment.checkout_session_id) throw new Error('Conflicting checkout session');
      return;
    }
    if (!order.checkoutCreating || !order.requestId || order.paymentId || typeof payment.checkout_session_id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(payment.checkout_session_id)) throw new Error('Checkout recovery requires an unresolved creation attempt');
    validateCapturedPayment({ ...order, sessionId: payment.checkout_session_id }, payment, environment, orderId);
    const bound = await ctx.db.query('checkoutOrders').withIndex('by_environment_session', (q: any) => q.eq('environment', environment).eq('sessionId', payment.checkout_session_id)).first();
    if (bound || await ctx.db.query('purchases').withIndex('by_reference', q => q.eq('reference', payment.payment_id)).first()) throw new Error('Checkout recovery binding already used');
    await ctx.db.patch(orderId, { sessionId: payment.checkout_session_id, checkoutCreating: false, recoveredSessionPaymentId: payment.payment_id, sessionRecoveredAt: Date.now() });
  },
});

// Called after a fresh provider lookup by the signed webhook or authenticated reconciliation action.
export const recordDispute = internalMutation({
  args: { orderId: v.id('checkoutOrders'), payment: v.any(), dispute: v.any(), environment: v.string(), observedAt: v.number() },
  handler: async (ctx, { orderId, payment, dispute: d, environment, observedAt }) => {
    const order = await ctx.db.get(orderId);
    if (!order?.sessionId) throw new Error('Checkout not ready');
    validateCapturedPayment(order, payment, environment, orderId);
    if (order.paymentId && order.paymentId !== payment.payment_id) throw new Error('Order payment conflict');
    const statuses = ['dispute_opened', 'dispute_expired', 'dispute_accepted', 'dispute_cancelled', 'dispute_challenged', 'dispute_won', 'dispute_lost'];
    if (!d || d.business_id !== process.env.DODO_BUSINESS_ID || d.payment_id !== payment.payment_id || d.currency !== 'USD' ||
      typeof d.dispute_id !== 'string' || !d.dispute_id || d.dispute_id.length > 200 || !statuses.includes(d.dispute_status) ||
      !['pre_dispute', 'dispute', 'pre_arbitration'].includes(d.dispute_stage) || typeof d.amount !== 'string' || !/^\d{1,30}(?:\.\d{1,10})?$/.test(d.amount) ||
      typeof d.created_at !== 'string' || !Number.isFinite(Date.parse(d.created_at)) || !Number.isFinite(observedAt) || observedAt < 0 || observedAt > Date.now() + 60_000) throw new Error('Dispute does not match payment');
    const existing = await ctx.db.query('paymentDisputes').withIndex('by_reference', q => q.eq('reference', d.dispute_id)).unique();
    if (existing && (existing.orderId !== orderId || existing.paymentId !== payment.payment_id || existing.environment !== environment)) throw new Error('Dispute already belongs to another payment');
    if (existing && existing.observedAt >= observedAt) return;
    const snapshot = { orderId, reference: d.dispute_id, paymentId: payment.payment_id, environment, amount: d.amount, currency: d.currency, status: d.dispute_status, stage: d.dispute_stage, providerCreatedAt: Date.parse(d.created_at), observedAt };
    if (existing) await ctx.db.patch(existing._id, snapshot);
    else await ctx.db.insert('paymentDisputes', snapshot);
    // No guessed amount units or automatic reversals. Review persists even after
    // a resolution observation until the credit policy is implemented/accepted.
    await ctx.db.patch(orderId, { disputeReview: true });
  },
});

export const fulfill = internalMutation({
  args: { orderId: v.id('checkoutOrders'), payment: v.any(), environment: v.string() },
  handler: async (ctx, { orderId, payment: p, environment }) => {
    const order = await ctx.db.get(orderId);
    if (!order || !order.sessionId) throw new Error('Checkout not ready');
    validateCapturedPayment(order, p, environment, orderId);
    const tax = p.tax ?? 0;
    const existing = await ctx.db.query('purchases').withIndex('by_reference', q => q.eq('reference', p.payment_id)).unique();
    if (existing) {
      if (order.paymentId !== p.payment_id) throw new Error('Payment already used');
      return;
    }
    if (order.disputeReview || p.disputes?.length) throw new Error('Dispute review required before fulfillment');
    if (p.refund_status) throw new Error('Refund must be reconciled before fulfillment');
    if (order.status === 'paid') throw new Error('Order already paid');
    const user = await ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', order.userId)).unique();
    if (!user) throw new Error('Account missing');
    await ctx.db.patch(user._id, { credits: user.credits + order.credits });
    await ctx.db.insert('purchases', { tokenIdentifier: order.userId, packId: order.packId, credits: order.credits, amountUsd: order.amountMinor / 100, provider: 'dodo', reference: p.payment_id, at: Date.now() });
    await ctx.db.patch(orderId, { status: 'paid', paymentId: p.payment_id, paidTotalMinor: p.total_amount, taxMinor: tax });
  },
});

export const recordStatus = internalMutation({
  args: { orderId: v.id('checkoutOrders'), payment: v.any(), environment: v.string(), observedAt: v.number() },
  handler: async (ctx, { orderId, payment: p, environment, observedAt }) => {
    const order = await ctx.db.get(orderId);
    if (!order || !order.sessionId || p.business_id !== process.env.DODO_BUSINESS_ID || environment !== order.environment ||
      p.checkout_session_id !== order.sessionId || p.metadata?.orderId !== orderId || typeof p.payment_id !== 'string' ||
      !UNSETTLED_PAYMENT_STATES.includes(p.status) || !Number.isFinite(observedAt)) throw new Error('Payment status does not match order');
    // A late failure event cannot undo confirmed payment or a newer observation.
    if (order.paymentId || order.status === 'paid' || observedAt < (order.statusObservedAt ?? 0)) return;
    if (observedAt === order.statusObservedAt && ['failed', 'cancelled'].includes(order.status) && !['failed', 'cancelled'].includes(p.status)) return;
    await ctx.db.patch(orderId, { status: p.status, statusObservedAt: observedAt });
  },
});
function historyRow(order: any) {
  return { id: order._id, packId: order.packId, credits: order.credits, amountUsd: order.amountMinor / 100,
    canResume: !!order.sessionId && !!order.checkoutUrl && !order.paymentId && !order.disputeReview && RESUMABLE_PAYMENT_STATES.includes(order.status) && Date.now() - order.createdAt < 23 * 3600000, disputeReview: order.disputeReview, status: order.status, refundedAmountUsd: (order.refundedAmountMinor ?? 0) / 100, refundedCredits: order.refundedCredits ?? 0, createdAt: order.createdAt, environment: order.environment, paidAmountUsd: order.paidTotalMinor === undefined ? undefined : order.paidTotalMinor / 100 };
}
export const history = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return [];
  const orders = await ctx.db.query('checkoutOrders').withIndex('by_user', q => q.eq('userId', identity.subject)).order('desc').take(25);
  return orders.map(historyRow);
} });
export const listHistory = query({ args: { accountKey: v.string(), paginationOpts: paginationOptsValidator }, handler: async (ctx, { accountKey, paginationOpts }) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('UNAUTHENTICATED');
  if (identity.subject !== accountKey) return { page: [], isDone: true, continueCursor: '' };
  if (!Number.isInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > 50) throw new ConvexError('INVALID_PAGE_SIZE');
  const result = await ctx.db.query('checkoutOrders').withIndex('by_user', q => q.eq('userId', identity.subject)).order('desc').paginate(paginationOpts);
  return { ...result, page: result.page.map(historyRow) };
} });

export const claimCheckout = internalMutation({ args: { orderId: v.id('checkoutOrders') }, handler: async (ctx, args) => {
  const order = await ctx.db.get(args.orderId);
  if (!order) throw new Error('Order missing');
  if (order.paymentId || order.status === 'paid') throw new ConvexError('CHECKOUT_ALREADY_PAID');
  if (order.status === 'expired') throw new ConvexError('CHECKOUT_RETRY_ALLOWED');
  if (Date.now() - order.createdAt > 23 * 3600000) throw new ConvexError('CHECKOUT_EXPIRED');
  if (order.checkoutUrl) return { claimed: false, url: order.checkoutUrl };
  // Do not repeat an ambiguous external create. Reconciliation must resolve it.
  if (order.checkoutCreating) return { claimed: false };
  await ctx.db.patch(order._id, { checkoutCreating: true });
  return { claimed: true };
} });

export const recordExpiredCheckout = internalMutation({
  args: { orderId: v.id('checkoutOrders'), sessionId: v.string(), sessionCreatedAt: v.number(), observedAt: v.number() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    const { sessionCreatedAt, observedAt } = args;
    if (!order || order.sessionId !== args.sessionId || !Number.isFinite(sessionCreatedAt) || !Number.isFinite(observedAt) || sessionCreatedAt < 0 || observedAt > Date.now() || observedAt - sessionCreatedAt < 24 * 3600000 + 300000) throw new Error('Invalid checkout expiry observation');
    if (order.paymentId || order.disputeReview || order.status === 'paid' || observedAt < (order.statusObservedAt ?? 0)) return;
    await ctx.db.patch(order._id, { status: 'expired', statusObservedAt: observedAt });
  },
});

export const releaseCheckout = internalMutation({ args: { orderId: v.id('checkoutOrders') }, handler: async (ctx, args) => {
  const order = await ctx.db.get(args.orderId);
  if (order && !order.sessionId) await ctx.db.patch(args.orderId, { checkoutCreating: false });
} });

export const claimRefresh = internalMutation({ args: { orderId: v.id('checkoutOrders') }, handler: async (ctx, { orderId }) => {
  const identity = await ctx.auth.getUserIdentity();
  const order = await ctx.db.get(orderId);
  if (!identity || !order || order.userId !== identity.subject) throw new ConvexError('ORDER_UNAVAILABLE');
  if (!order.sessionId) throw new ConvexError('CHECKOUT_NEEDS_REVIEW');
  if (order.lastRefreshAt !== undefined && Date.now() - order.lastRefreshAt < 60000) throw new ConvexError('REFRESH_TOO_SOON');
  await ctx.db.patch(orderId, { lastRefreshAt: Date.now() });
  return { paymentId: order.paymentId, sessionId: order.sessionId, environment: order.environment };
}});
export const refreshStatus = action({ args: { orderId: v.id('checkoutOrders') }, handler: async (ctx, { orderId }): Promise<{ status: string }> => {
  const order = await ctx.runMutation(ref<'mutation'>('payments:claimRefresh'), { orderId });
  return reconcilePayment(ctx, orderId, order);
}});
export const resumeCheckout = action({ args: { orderId: v.id('checkoutOrders') }, handler: async (ctx, { orderId }): Promise<{ url: string }> => {
  const order = await ctx.runMutation(ref<'mutation'>('payments:claimRefresh'), { orderId });
  await reconcilePayment(ctx, orderId, order, true);
  return await ctx.runQuery(ref<'query'>('payments:readResumeCheckout'), { orderId, sessionId: order.sessionId });
}});
export const readResumeCheckout = internalQuery({ args: { orderId: v.id('checkoutOrders'), sessionId: v.string() }, handler: async (ctx, { orderId, sessionId }) => {
  const identity = await ctx.auth.getUserIdentity(), order = await ctx.db.get(orderId);
  if (!identity || !order || order.userId !== identity.subject) throw new ConvexError('ORDER_UNAVAILABLE');
  if (order.sessionId !== sessionId || order.paymentId || order.disputeReview || !RESUMABLE_PAYMENT_STATES.includes(order.status) || Date.now() - order.createdAt >= 23 * 3600000 || !order.checkoutUrl) throw new ConvexError('CHECKOUT_NOT_RESUMABLE');
  const url = new URL(order.checkoutUrl);
  const host = order.environment === 'test' ? 'test.checkout.dodopayments.com' : order.environment === 'live' ? 'checkout.dodopayments.com' : '';
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password) throw new ConvexError('CHECKOUT_NOT_RESUMABLE');
  return { url: order.checkoutUrl };
}});
async function reconcilePayment(ctx: any, orderId: any, order: any, forResume = false): Promise<{ status: string }> {
  const environment = process.env.DODO_ENVIRONMENT;
  const key = process.env.DODO_API_KEY;
  if (!key || !process.env.DODO_BUSINESS_ID || !['test', 'live'].includes(environment ?? '') || environment !== order.environment) throw new ConvexError('PAYMENTS_UNCONFIGURED');
  const get = async (path: string) => {
    const response = await fetch(`https://${environment}.dodopayments.com/${path}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new ConvexError('PAYMENT_REFRESH_FAILED');
    return response.json();
  };
  const observedAt = Date.now();
  const session = await get(`checkouts/${encodeURIComponent(order.sessionId)}`);
  if (session.id !== order.sessionId) throw new ConvexError('PAYMENT_REFRESH_FAILED');
  if (forResume) {
    const createdAt = typeof session.created_at === 'string' ? Date.parse(session.created_at) : NaN;
    const empty = session.payment_id === null && session.payment_status === null;
    const hasPayment = typeof session.payment_id === 'string' && !!session.payment_id && typeof session.payment_status === 'string';
    if (!Number.isFinite(createdAt) || createdAt > observedAt || observedAt - createdAt >= 23 * 3600000 || (!empty && !hasPayment)) throw new ConvexError('CHECKOUT_NOT_RESUMABLE');
  }
  if (!session.payment_id) {
    if (order.paymentId) throw new ConvexError('PAYMENT_REFRESH_FAILED');
    const createdAt = typeof session.created_at === 'string' ? Date.parse(session.created_at) : NaN;
    if (session.payment_id === null && session.payment_status === null && Number.isFinite(createdAt) && createdAt >= 0 && observedAt - createdAt >= 24 * 3600000 + 300000) {
      await ctx.runMutation(ref<'mutation'>('payments:recordExpiredCheckout'), { orderId, sessionId: order.sessionId, sessionCreatedAt: createdAt, observedAt });
      return await ctx.runQuery(ref<'query'>('payments:readReconciledStatus'), { orderId });
    }
    return { status: 'pending' };
  }
  if (typeof session.payment_id !== 'string' || order.paymentId && session.payment_id !== order.paymentId) throw new ConvexError('PAYMENT_REFRESH_FAILED');
  const payment = await get(`payments/${encodeURIComponent(session.payment_id)}`);
  if (payment.payment_id !== session.payment_id || payment.metadata?.orderId !== orderId) throw new ConvexError('PAYMENT_REFRESH_FAILED');
  if (payment.status === 'succeeded') {
    await recordPaymentDisputes(ctx, payment, environment!, observedAt);
    const refund = payment.refunds?.find((r: any) => r.status === 'succeeded');
    if (refund) {
      await ctx.runMutation(ref<'mutation'>('payments:applyRefund'), { orderId, payment, refund, environment });
    } else if (payment.disputes?.length || order.disputeReview) return { status: 'dispute_review' };
    else await ctx.runMutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment });
  } else {
    if (!UNSETTLED_PAYMENT_STATES.includes(payment.status)) throw new ConvexError('PAYMENT_REFRESH_FAILED');
    await ctx.runMutation(ref<'mutation'>('payments:recordStatus'), { orderId, payment, environment, observedAt });
  }
  const confirmed = await ctx.runQuery(ref<'query'>('payments:readReconciledStatus'), { orderId });
  if (!confirmed) throw new ConvexError('ORDER_UNAVAILABLE');
  return { status: confirmed.status };
}
export const readReconciledStatus = internalQuery({ args: { orderId: v.id('checkoutOrders') }, handler: async (ctx, { orderId }) => {
  const order = await ctx.db.get(orderId);
  return order ? { status: order.disputeReview ? 'dispute_review' : order.status } : null;
}});

export const applyRefund = internalMutation({ args: { orderId: v.id('checkoutOrders'), payment: v.any(), refund: v.any(), environment: v.string() }, handler: async (ctx, { orderId, payment: p, refund: r, environment }) => {
  const order = await ctx.db.get(orderId);
  if (!order?.sessionId) throw new Error('Checkout not ready');
  validateCapturedPayment(order, p, environment, orderId);
  if (r.status !== 'succeeded' || r.business_id !== process.env.DODO_BUSINESS_ID || r.payment_id !== p.payment_id || r.currency !== 'USD' || typeof r.refund_id !== 'string' || !r.refund_id || !Number.isSafeInteger(r.amount) || r.amount <= 0) throw new Error('Refund does not match payment');
  if (!Array.isArray(p.refunds) || p.refunds.length > 100 || !p.refunds.some((x: any) => x.refund_id === r.refund_id && x.status === 'succeeded' && x.amount === r.amount)) throw new Error('Incomplete refund snapshot');
  const newRefunds = [], seen = new Set();
  let refundedAmountMinor = order.refundedAmountMinor ?? 0;
  for (const item of p.refunds.filter((x: any) => x.status === 'succeeded')) {
    if (item.business_id !== process.env.DODO_BUSINESS_ID || item.payment_id !== p.payment_id || item.currency !== 'USD' || typeof item.refund_id !== 'string' || !item.refund_id || seen.has(item.refund_id) || !Number.isSafeInteger(item.amount) || item.amount <= 0) throw new Error('Invalid refund snapshot');
    seen.add(item.refund_id);
    const existing = await ctx.db.query('paymentRefunds').withIndex('by_reference', q => q.eq('reference', item.refund_id)).unique();
    if (existing) {
      if (existing.orderId !== orderId || existing.paymentId !== p.payment_id || existing.amountMinor !== item.amount) throw new Error('Refund reference conflict');
    } else { newRefunds.push(item); refundedAmountMinor += item.amount; }
  }
  if (order.paymentId && order.paymentId !== p.payment_id) throw new Error('Order payment conflict');
  if (refundedAmountMinor > p.total_amount || p.total_amount <= 0 || p.refund_status === 'full' && refundedAmountMinor !== p.total_amount) throw new Error('Refund exceeds or does not match payment');
  if (!newRefunds.length) return;
  const refundedCredits = Math.min(order.credits, Math.ceil(order.credits * refundedAmountMinor / p.total_amount));
  const purchase = await ctx.db.query('purchases').withIndex('by_reference', q => q.eq('reference', p.payment_id)).unique();
  if (purchase && order.paymentId !== p.payment_id) throw new Error('Payment already used');
  const user = await ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', order.userId)).unique();
  if (!user) throw new Error('Account missing');
  if (!purchase && (order.disputeReview || p.disputes?.length)) throw new Error('Dispute review required before fulfillment');
  // Refund-before-payment-event also settles the verified captured purchase, net of refunds.
  const delta = (purchase ? 0 : order.credits) - (refundedCredits - (order.refundedCredits ?? 0));
  await ctx.db.patch(user._id, { credits: user.credits + delta });
  if (!purchase) await ctx.db.insert('purchases', { tokenIdentifier: order.userId, packId: order.packId, credits: order.credits, amountUsd: order.amountMinor / 100, provider: 'dodo', reference: p.payment_id, at: Date.now() });
  for (const item of newRefunds) await ctx.db.insert('paymentRefunds', { orderId, reference: item.refund_id, paymentId: p.payment_id, amountMinor: item.amount, at: Date.now() });
  await ctx.db.patch(orderId, { paymentId: p.payment_id, paidTotalMinor: p.total_amount, taxMinor: p.tax ?? 0, refundedAmountMinor, refundedCredits, status: refundedAmountMinor === p.total_amount ? 'refunded' : 'partially_refunded' });
}});

export const scheduleReconciliation = internalMutation({ args: {}, handler: async (ctx) => {
  const environment = process.env.DODO_ENVIRONMENT;
  if (process.env.DODO_RECONCILIATION_ENABLED !== 'true' || !['test', 'live'].includes(environment ?? '') || !process.env.DODO_API_KEY || !process.env.DODO_BUSINESS_ID) return 0;
  const orders = await ctx.db.query('checkoutOrders').withIndex('by_environment_reconcile', (q: any) => q.eq('environment', environment).gte('nextReconcileAt', 0).lte('nextReconcileAt', Date.now())).take(25);
  for (const order of orders) {
    if (order.lastRefreshAt !== undefined && Date.now() - order.lastRefreshAt < 60000) {
      await ctx.db.patch(order._id, { nextReconcileAt: order.lastRefreshAt + 60000 }); continue;
    }
    const attempt = (order.reconcileAttempt ?? 0) + 1;
    await ctx.db.patch(order._id, { reconcileAttempt: attempt, reconcileRunning: false, nextReconcileAt: Date.now() + 600000 });
    await ctx.scheduler.runAfter(0, ref<'action'>('payments:reconcileScheduled'), { orderId: order._id, attempt });
  }
  return orders.length;
}});
export const claimReconciliation = internalMutation({ args: { orderId: v.id('checkoutOrders'), attempt: v.number() }, handler: async (ctx, { orderId, attempt }) => {
  if (process.env.DODO_RECONCILIATION_ENABLED !== 'true') return null;
  const order = await ctx.db.get(orderId);
  if (!order || order.reconcileAttempt !== attempt || order.reconcileRunning) return null;
  await ctx.db.patch(orderId, { reconcileRunning: true, lastRefreshAt: Date.now() });
  return { sessionId: order.sessionId, paymentId: order.paymentId, environment: order.environment };
}});
export const finishReconciliation = internalMutation({ args: { orderId: v.id('checkoutOrders'), attempt: v.number(), success: v.boolean(), needsReview: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const order = await ctx.db.get(args.orderId);
  if (!order || order.reconcileAttempt !== args.attempt || !order.reconcileRunning || order.reconcileFinishedAttempt === args.attempt) return;
  const settled = !!order.paymentId;
  const finishedAt = Date.now();
  await ctx.db.patch(order._id, { reconcileFinishedAttempt: args.attempt, nextReconcileAt: finishedAt + (args.success && settled || args.needsReview ? 86400000 : 900000), reconcileError: args.success ? undefined : args.needsReview ? 'missing_session_review_required' : 'provider_check_failed', ...(args.success ? { reconciledAt: finishedAt } : {}) });
}});
export const reconcileScheduled = internalAction({ args: { orderId: v.id('checkoutOrders'), attempt: v.number() }, handler: async (ctx, args) => {
  const order = await ctx.runMutation(ref<'mutation'>('payments:claimReconciliation'), args);
  if (!order) return;
  let success = false;
  try { if (order.sessionId) { await reconcilePayment(ctx, args.orderId, order); success = true; } }
  catch { /* No raw provider details in saved operational errors. */ }
  await ctx.runMutation(ref<'mutation'>('payments:finishReconciliation'), { ...args, success, needsReview: !order.sessionId });
}});

// Explicit staging/production migration step; never run automatically during validation.
export const enrollExistingOrders = internalMutation({ args: { environment: v.union(v.literal('test'), v.literal('live')) }, handler: async (ctx, { environment }) => {
  const orders = await ctx.db.query('checkoutOrders').withIndex('by_environment_reconcile', (q: any) => q.eq('environment', environment).eq('nextReconcileAt', undefined)).take(100);
  for (const order of orders) await ctx.db.patch(order._id, { nextReconcileAt: Date.now() + 300000 });
  return orders.length;
}});
