import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
  vi.stubEnv('DODO_BUSINESS_ID', 'business');
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', credits: 0, freeUsed: 0 }));
  const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test' });
  await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'session' });
  const payment = { payment_id: 'pay1', status: 'succeeded', business_id: 'business', checkout_session_id: 'session', metadata: { orderId }, currency: 'USD', total_amount: 1099, tax: 100, product_cart: [{ product_id: 'product', quantity: 1 }] };
  return { t, orderId, payment };
}
test('verified payment grants the saved pack once despite concurrent retries', async () => {
  const { t, orderId, payment } = await setup();
  const fulfill = () => t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
  await Promise.all([fulfill(), fulfill(), fulfill()]);
  expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
  expect(await t.run(ctx => ctx.db.query('purchases').collect())).toHaveLength(1);
});
test.each([
  { total_amount: 1 }, { currency: 'EUR' }, { tax: -1 }, { business_id: 'other' },
  { checkout_session_id: 'other' }, { status: 'failed' }, { refund_status: 'full' },
  { product_cart: [{ product_id: 'wrong', quantity: 1 }] },
  { product_cart: [{ product_id: 'product', quantity: 2 }] },
  { metadata: { credits: '500' } },
])('rejects mismatched payment %j', async patch => {
  const { t, orderId, payment } = await setup();
  await expect(t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment: { ...payment, ...patch }, environment: 'test' })).rejects.toThrow();
  expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});
test('test payments cannot fulfill live orders; order queries enforce ownership', async () => {
  const { t, orderId, payment } = await setup();
  await expect(t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'live' })).rejects.toThrow();
  expect(await t.withIdentity({ subject: 'other' }).query(ref<'query'>('payments:orderStatus'), { orderId })).toBeNull();
  expect(await t.withIdentity({ subject: 'u1' }).query(ref<'query'>('payments:orderStatus'), { orderId })).toMatchObject({ status: 'pending', credits: 25 });
});
test('checkout uses configured product and origin, never browser return URL or price', async () => {
  const { t } = await setup();
  for (const [key, value] of Object.entries({ DODO_CHECKOUT_ENABLED: 'true', DODO_API_KEY: 'key', DODO_PRODUCT_STARTER: 'product', DODO_ENVIRONMENT: 'test', APP_URL: 'https://takeone.web.app', DODO_WEBHOOK_SECRET: 'secret' })) vi.stubEnv(key, value);
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ checkout_url: 'https://checkout.dodopayments.com/test', session_id: 'new-session' })));
  vi.stubGlobal('fetch', fetchMock);
  await t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:createCheckout'), { packId: 'starter', requestId: 'checkout-request-1', returnUrl: 'https://attacker.invalid' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://test.dodopayments.com/checkouts');
  const body = JSON.parse(init.body);
  expect(body.return_url).toMatch(/^https:\/\/takeone.web.app\/pricing\?order=/);
  expect(body.product_cart).toEqual([{ product_id: 'product', quantity: 1 }]);
});
test('verified failed/processing statuses do not grant credits or downgrade paid orders', async () => {
  const { t, orderId, payment } = await setup();
  const status = (value: string, observedAt: number) => t.mutation(ref<'mutation'>('payments:recordStatus'), { orderId, payment: { ...payment, status: value }, environment: 'test', observedAt });
  await status('failed', 200);
  await status('processing', 100);
  expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('failed');
  expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
  await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
  await status('cancelled', 300);
  expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('paid');
  expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
});
test('history is owner scoped and status events must bind to the correct session', async () => {
  const { t, orderId, payment } = await setup();
  await expect(t.mutation(ref<'mutation'>('payments:recordStatus'), { orderId, payment: { ...payment, status: 'failed', checkout_session_id: 'foreign' }, environment: 'test', observedAt: 10 })).rejects.toThrow();
  expect(await t.withIdentity({ subject: 'other' }).query(ref<'query'>('payments:history'), {})).toEqual([]);
  const rows = await t.withIdentity({ subject: 'u1' }).query(ref<'query'>('payments:history'), {});
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ credits: 25, amountUsd: 9.99, status: 'pending', environment: 'test' });
  expect(rows[0]).not.toHaveProperty('sessionId');
});
test('confirmation query handles malformed IDs and history includes the actual tax-inclusive paid amount', async () => {
  const { t, orderId, payment } = await setup();
  const actor = t.withIdentity({ subject: 'u1' });
  expect(await actor.query(ref<'query'>('payments:orderStatus'), { orderId: 'not-a-valid-order-id' })).toBeNull();
  await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
  const history = await actor.query(ref<'query'>('payments:history'), {});
  expect(history[0]).toMatchObject({ amountUsd: 9.99, paidAmountUsd: 10.99, status: 'paid' });
});
test('same checkout request reuses one order and only one concurrent caller claims provider creation', async () => {
  const { t } = await setup();
  const args = { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test', requestId: 'stable-request-1' };
  const ids = await Promise.all([t.mutation(ref<'mutation'>('payments:createOrder'), args), t.mutation(ref<'mutation'>('payments:createOrder'), args)]);
  expect(ids[0]).toBe(ids[1]);
  const claims = await Promise.all(ids.map(orderId => t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId })));
  expect(claims.filter(c => c.claimed)).toHaveLength(1);
  await expect(t.mutation(ref<'mutation'>('payments:createOrder'), { ...args, packId: 'pro' })).rejects.toThrow('CONFLICT');
  await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId: ids[0], sessionId: 'created-session', checkoutUrl: 'https://checkout.dodopayments.com/test' });
  expect(await t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId: ids[0] })).toEqual({ claimed: false, url: 'https://checkout.dodopayments.com/test' });
});
test('ambiguous creation cannot be silently retried, while explicit rejection can release it', async () => {
  const { t } = await setup();
  const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test', requestId: 'stable-request-2' });
  await t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId });
  expect(await t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId })).toEqual({ claimed: false });
  await t.mutation(ref<'mutation'>('payments:releaseCheckout'), { orderId });
  expect(await t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId })).toEqual({ claimed: true });
});

test('owner refresh recovers a missed successful webhook without creating a checkout', async () => {
 const { t, orderId, payment } = await setup();
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session', payment_id: 'pay1' }))).mockResolvedValueOnce(new Response(JSON.stringify(payment)));
 vi.stubGlobal('fetch', fetchMock);
 const actor = t.withIdentity({ subject: 'u1' });
 expect(await actor.action(ref<'action'>('payments:refreshStatus'), { orderId })).toEqual({ status: 'paid' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
 await expect(actor.action(ref<'action'>('payments:refreshStatus'), { orderId })).rejects.toThrow('REFRESH_TOO_SOON');
 expect(fetchMock).toHaveBeenCalledTimes(2);
 expect(fetchMock.mock.calls[0][0]).toBe('https://test.dodopayments.com/checkouts/session');
 expect(fetchMock.mock.calls[1][0]).toBe('https://test.dodopayments.com/payments/pay1');
 expect(await t.run(ctx => ctx.db.query('purchases').collect())).toHaveLength(1);
});
test('refresh rejects foreign orders, mismatched payment data and immediate retries', async () => {
 const { t, orderId, payment } = await setup();
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session', payment_id: 'pay1' }))).mockResolvedValueOnce(new Response(JSON.stringify({ ...payment, total_amount: 1 })));
 vi.stubGlobal('fetch', fetchMock);
 await expect(t.withIdentity({ subject: 'other' }).action(ref<'action'>('payments:refreshStatus'), { orderId })).rejects.toThrow('ORDER_UNAVAILABLE');
 expect(fetchMock).not.toHaveBeenCalled();
 const actor = t.withIdentity({ subject: 'u1' });
 await expect(actor.action(ref<'action'>('payments:refreshStatus'), { orderId })).rejects.toThrow('Payment does not match order');
 await expect(actor.action(ref<'action'>('payments:refreshStatus'), { orderId })).rejects.toThrow('REFRESH_TOO_SOON');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});
test('refresh holds ambiguous session creation for review rather than issuing another checkout', async () => {
 const { t } = await setup();
 const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test' });
 const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
 await expect(t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:refreshStatus'), { orderId })).rejects.toThrow('CHECKOUT_NEEDS_REVIEW');
 expect(fetchMock).not.toHaveBeenCalled();
});

test('cumulative refunds remove credits once, preserve spent-credit adjustments and resist late events', async () => {
 const { t, orderId, payment } = await setup();
 await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
 await t.run(async ctx => { const u = await ctx.db.query('users').first(); await ctx.db.patch(u!._id, { credits: 5 }); });
 const r1 = { refund_id: 'refund1', payment_id: 'pay1', business_id: 'business', status: 'succeeded', amount: 550, currency: 'USD' };
 const r2 = { ...r1, refund_id: 'refund2', amount: 549 };
 const apply = (refund: any, refunds: any[]) => t.mutation(ref<'mutation'>('payments:applyRefund'), { orderId, refund, payment: { ...payment, refund_status: refunds.length === 2 ? 'full' : 'partial', refunds }, environment: 'test' });
 await Promise.all([apply(r1, [r1]), apply(r1, [r1])]);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(-8);
 await apply(r2, [r1, r2]); await apply(r1, [r1]);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(-20);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('refunded');
 await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(-20);
 const me = await t.withIdentity({ subject: 'u1' }).query(ref<'query'>('users:currentUser'), {});
 expect(me).toMatchObject({ credits: 0, creditAdjustment: 20 });
 expect(await t.run(ctx => ctx.db.query('paymentRefunds').collect())).toHaveLength(2);
});
test('refund arriving before payment notification settles only remaining credit entitlement', async () => {
 const { t, orderId, payment } = await setup();
 const refund = { refund_id: 'refund1', payment_id: 'pay1', business_id: 'business', status: 'succeeded', amount: 1099, currency: 'USD' };
 await t.mutation(ref<'mutation'>('payments:applyRefund'), { orderId, refund, payment: { ...payment, refund_status: 'full', refunds: [refund] }, environment: 'test' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});
test.each([{ amount: -1 }, { amount: 1100 }, { currency: 'EUR' }, { business_id: 'other' }, { payment_id: 'other' }, { status: 'failed' }])('rejects invalid refund %j atomically', async patch => {
 const { t, orderId, payment } = await setup();
 const refund = { refund_id: 'refund1', payment_id: 'pay1', business_id: 'business', status: 'succeeded', amount: 100, currency: 'USD', ...patch };
 await expect(t.mutation(ref<'mutation'>('payments:applyRefund'), { orderId, refund, payment: { ...payment, refunds: [refund] }, environment: 'test' })).rejects.toThrow();
 expect(await t.run(ctx => ctx.db.query('paymentRefunds').collect())).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});

test('refreshing a previously paid order recovers a missed refund webhook', async () => {
 const { t, orderId, payment } = await setup();
 await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 const refund = { refund_id: 'refund-missed', payment_id: 'pay1', business_id: 'business', status: 'succeeded', amount: 1099, currency: 'USD' };
 const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session', payment_id: 'pay1' }))).mockResolvedValueOnce(new Response(JSON.stringify({ ...payment, refund_status: 'full', refunds: [refund] })));
 vi.stubGlobal('fetch', fetchMock);
 expect(await t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:refreshStatus'), { orderId })).toEqual({ status: 'refunded' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('refunded');
 expect(await t.run(ctx => ctx.db.query('paymentRefunds').collect())).toHaveLength(1);
});
test('refresh returns durable refunded status rather than a stale provider snapshot', async () => {
 const { t, orderId, payment } = await setup();
 const refund = { refund_id: 'refund-missed', payment_id: 'pay1', business_id: 'business', status: 'succeeded', amount: 1099, currency: 'USD' };
 await t.mutation(ref<'mutation'>('payments:applyRefund'), { orderId, payment: { ...payment, refund_status: 'full', refunds: [refund] }, refund, environment: 'test' });
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session', payment_id: 'pay1' }))).mockResolvedValueOnce(new Response(JSON.stringify(payment))));
 expect(await t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:refreshStatus'), { orderId })).toEqual({ status: 'refunded' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});

test('scheduled reconciliation is gated and settles a due order exactly once without a browser identity', async () => {
 const { t, orderId, payment } = await setup();
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 await t.run(ctx => ctx.db.patch(orderId, { nextReconcileAt: Date.now() - 1 }));
 expect(await t.mutation(ref<'mutation'>('payments:scheduleReconciliation'), {})).toBe(0);
 vi.stubEnv('DODO_RECONCILIATION_ENABLED', 'true');
 expect(await t.mutation(ref<'mutation'>('payments:scheduleReconciliation'), {})).toBe(1);
 expect(await t.mutation(ref<'mutation'>('payments:scheduleReconciliation'), {})).toBe(0);
 const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session', payment_id: 'pay1' }))).mockResolvedValueOnce(new Response(JSON.stringify(payment)));
 vi.stubGlobal('fetch', fetchMock);
 const run = () => t.action(ref<'action'>('payments:reconcileScheduled'), { orderId, attempt: 1 });
 await Promise.all([run(), run()]);
 expect(fetchMock).toHaveBeenCalledTimes(2);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
 const order = await t.run(ctx => ctx.db.get(orderId));
 expect(order).toMatchObject({ status: 'paid', reconcileFinishedAttempt: 1 });
 expect(order!.nextReconcileAt! - order!.reconciledAt!).toBe(86400000);
 await t.mutation(ref<'mutation'>('payments:finishReconciliation'), { orderId, attempt: 1, success: false });
 expect((await t.run(ctx => ctx.db.get(orderId)))?.reconcileError).toBeUndefined();
});
test('scheduler batches due orders by environment and fences stale work', async () => {
 const { t, orderId } = await setup();
 for (const [key, value] of Object.entries({ DODO_API_KEY: 'key', DODO_ENVIRONMENT: 'test', DODO_RECONCILIATION_ENABLED: 'true' })) vi.stubEnv(key, value);
 const now = Date.now();
 await t.run(async ctx => {
  for (let i = 0; i < 26; i++) await ctx.db.insert('checkoutOrders', { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test', credits: 25, amountMinor: 999, status: 'pending', createdAt: now, nextReconcileAt: now - 1 });
  await ctx.db.patch(orderId, { environment: 'live', nextReconcileAt: now - 1 });
 });
 expect(await t.mutation(ref<'mutation'>('payments:scheduleReconciliation'), {})).toBe(25);
 expect(await t.mutation(ref<'mutation'>('payments:scheduleReconciliation'), {})).toBe(1);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.reconcileAttempt).toBeUndefined();
 const due = (await t.run(ctx => ctx.db.query('checkoutOrders').collect())).find(o => o.environment === 'test')!;
 await t.mutation(ref<'mutation'>('payments:claimReconciliation'), { orderId: due._id, attempt: 1 });
 await t.run(ctx => ctx.db.patch(due._id, { nextReconcileAt: now - 1, lastRefreshAt: now - 60001 }));
 await t.mutation(ref<'mutation'>('payments:scheduleReconciliation'), {});
 await t.mutation(ref<'mutation'>('payments:finishReconciliation'), { orderId: due._id, attempt: 1, success: false });
 expect((await t.run(ctx => ctx.db.get(due._id)))?.reconcileAttempt).toBe(2);
 expect((await t.run(ctx => ctx.db.get(due._id)))?.reconcileError).toBeUndefined();
});

test.each([false, true])('scheduled provider failure or missing session is recoverable (missing=%s)', async missing => {
 const { t, orderId } = await setup();
 for (const [key, value] of Object.entries({ DODO_API_KEY: 'key', DODO_ENVIRONMENT: 'test', DODO_RECONCILIATION_ENABLED: 'true' })) vi.stubEnv(key, value);
 await t.run(ctx => ctx.db.patch(orderId, { nextReconcileAt: Date.now() - 1, ...(missing ? { sessionId: undefined } : {}) }));
 await t.mutation(ref<'mutation'>('payments:scheduleReconciliation'), {});
 const request = vi.fn().mockRejectedValue(Error('sensitive provider response'));
 vi.stubGlobal('fetch', request);
 await t.action(ref<'action'>('payments:reconcileScheduled'), { orderId, attempt: 1 });
 const order = await t.run(ctx => ctx.db.get(orderId));
 expect(order?.reconcileError).toBe(missing ? 'missing_session_review_required' : 'provider_check_failed');
 expect(order?.reconciledAt).toBeUndefined();
 expect(order!.nextReconcileAt).toBeGreaterThan(Date.now());
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 if (missing) expect(request).not.toHaveBeenCalled();
});

test('existing-order enrollment preserves balances and only targets the selected environment', async () => {
 const { t, orderId } = await setup();
 await t.run(ctx => ctx.db.patch(orderId, { nextReconcileAt: undefined }));
 expect(await t.mutation(ref<'mutation'>('payments:enrollExistingOrders'), { environment: 'live' })).toBe(0);
 expect(await t.mutation(ref<'mutation'>('payments:enrollExistingOrders'), { environment: 'test' })).toBe(1);
 expect(await t.mutation(ref<'mutation'>('payments:enrollExistingOrders'), { environment: 'test' })).toBe(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});

const disputeFixture = (paymentId: string, status = 'dispute_opened') => ({ dispute_id: 'dp-1', payment_id: paymentId, business_id: 'business', currency: 'USD', amount: '9.99', created_at: '2026-09-01T00:00:00Z', dispute_stage: 'dispute', dispute_status: status });
test('verified disputes are recorded without guessed deductions and block new credit grants', async () => {
 const { t, orderId, payment } = await setup();
 const dispute = disputeFixture(payment.payment_id);
 const args = { orderId, payment, dispute, environment: 'test', observedAt: Date.now() };
 await t.mutation(ref<'mutation'>('payments:recordDispute'), args);
 await t.mutation(ref<'mutation'>('payments:recordDispute'), args);
 expect(await t.run(ctx => ctx.db.query('paymentDisputes').collect())).toHaveLength(1);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.disputeReview).toBe(true);
 await expect(t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' })).rejects.toThrow('Dispute review required');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 expect(await t.withIdentity({ subject: 'other' }).query(ref<'query'>('payments:history'), {})).toEqual([]);
 expect((await t.withIdentity({ subject: 'u1' }).query(ref<'query'>('payments:history'), {}))[0].disputeReview).toBe(true);
});
test('dispute observations preserve existing credits, reject mismatches and ignore older responses', async () => {
 const { t, orderId, payment } = await setup();
 await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
 const now = Date.now(); const args = { orderId, payment, environment: 'test', observedAt: now };
 await t.mutation(ref<'mutation'>('payments:recordDispute'), { ...args, dispute: disputeFixture(payment.payment_id, 'dispute_won') });
 await t.mutation(ref<'mutation'>('payments:recordDispute'), { ...args, observedAt: now - 1, dispute: disputeFixture(payment.payment_id) });
 expect((await t.run(ctx => ctx.db.query('paymentDisputes').first()))?.status).toBe('dispute_won');
 for (const patch of [{ payment_id: 'foreign' }, { business_id: 'foreign' }, { currency: 'EUR' }, { dispute_status: 'unknown' }, { amount: 'NaN' }]) {
  await expect(t.mutation(ref<'mutation'>('payments:recordDispute'), { ...args, dispute: { ...disputeFixture(payment.payment_id), ...patch } })).rejects.toThrow();
 }
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.disputeReview).toBe(true);
});
test('a dispute in a capture snapshot cannot bypass review through initial fulfillment', async () => {
 const { t, orderId, payment } = await setup();
 await expect(t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment: { ...payment, disputes: [disputeFixture(payment.payment_id)] }, environment: 'test' })).rejects.toThrow('Dispute review required');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});

test('refund-before-capture cannot grant the remaining disputed credits', async () => {
 const { t, orderId, payment } = await setup();
 const refund = { refund_id: 'r1', payment_id: payment.payment_id, business_id: 'business', status: 'succeeded', currency: 'USD', amount: 100 };
 await expect(t.mutation(ref<'mutation'>('payments:applyRefund'), { orderId, payment: { ...payment, disputes: [disputeFixture(payment.payment_id)], refunds: [refund] }, refund, environment: 'test' })).rejects.toThrow('Dispute review required');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 expect(await t.run(ctx => ctx.db.query('purchases').collect())).toHaveLength(0);
});

test('verified old unpaid session expires and permits an explicit new checkout attempt', async () => {
 const { t, orderId } = await setup();
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'session', payment_id: null, payment_status: null, created_at: new Date(Date.now() - 25 * 3600000).toISOString() })));
 vi.stubGlobal('fetch', fetchMock);
 expect(await t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:refreshStatus'), { orderId })).toEqual({ status: 'expired' });
 await expect(t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId })).rejects.toThrow('CHECKOUT_RETRY_ALLOWED');
 expect(fetchMock).toHaveBeenCalledTimes(1);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 expect(await t.run(ctx => ctx.db.query('purchases').collect())).toHaveLength(0);
});

test.each([
 { created_at: 'not-a-time', payment_id: null, payment_status: null },
 { created_at: new Date().toISOString(), payment_id: null, payment_status: null },
 { created_at: '2020-01-01T00:00:00Z', payment_id: null, payment_status: 'processing' },
 { created_at: '2020-01-01T00:00:00Z' },
])('incomplete or live checkout observation does not authorize expiry: %j', async session => {
 const { t, orderId } = await setup();
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'session', ...session }))));
 expect(await t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:refreshStatus'), { orderId })).toEqual({ status: 'pending' });
 expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('pending');
});

test('expiry observations cannot override payment, newer status or another session', async () => {
 const { t, orderId, payment } = await setup();
 const args = { orderId, sessionId: 'session', sessionCreatedAt: Date.now() - 25 * 3600000, observedAt: Date.now() };
 await expect(t.mutation(ref<'mutation'>('payments:recordExpiredCheckout'), { ...args, sessionId: 'foreign' })).rejects.toThrow('Invalid checkout expiry');
 await expect(t.mutation(ref<'mutation'>('payments:recordExpiredCheckout'), { ...args, sessionCreatedAt: Date.now() - 24 * 3600000 })).rejects.toThrow('Invalid checkout expiry');
 await t.run(ctx => ctx.db.patch(orderId, { status: 'processing', statusObservedAt: Date.now() }));
 await t.mutation(ref<'mutation'>('payments:recordExpiredCheckout'), { ...args, observedAt: Date.now() - 1000 });
 expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('processing');
 await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
 await t.mutation(ref<'mutation'>('payments:recordExpiredCheckout'), args);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('paid');
});

test.each(['requires_customer_action', 'requires_merchant_action', 'requires_payment_method', 'requires_confirmation', 'requires_capture', 'partially_captured', 'partially_captured_and_capturable'])('reconciliation records %s without granting credits', async status => {
 const { t, orderId, payment } = await setup();
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session', payment_id: 'pay1' }))).mockResolvedValueOnce(new Response(JSON.stringify({ ...payment, status })));
 vi.stubGlobal('fetch', fetchMock);
 expect(await t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:refreshStatus'), { orderId })).toEqual({ status });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 expect(await t.run(ctx => ctx.db.query('purchases').collect())).toHaveLength(0);
 await t.mutation(ref<'mutation'>('payments:fulfill'), { orderId, payment, environment: 'test' });
 await t.mutation(ref<'mutation'>('payments:recordStatus'), { orderId, payment: { ...payment, status }, environment: 'test', observedAt: Date.now() });
 expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('paid');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
});

test('same-time terminal and newer observations resist nonterminal regression', async () => {
 const { t, orderId, payment } = await setup();
 const observedAt = Date.now();
 const record = (status: string, at: number) => t.mutation(ref<'mutation'>('payments:recordStatus'), { orderId, payment: { ...payment, status }, environment: 'test', observedAt: at });
 await record('failed', observedAt);
 await record('requires_customer_action', observedAt);
 await record('partially_captured', observedAt - 1);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('failed');
 await record('requires_customer_action', observedAt + 1);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('requires_customer_action');
});

test('a slow canonical lookup cannot overwrite a newer payment observation', async () => {
 vi.useFakeTimers();
 try {
  const { t, orderId, payment } = await setup();
  vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
  const started = Date.now();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session', payment_id: 'pay1' }))).mockImplementationOnce(async () => {
   vi.setSystemTime(started + 2000);
   await t.mutation(ref<'mutation'>('payments:recordStatus'), { orderId, payment: { ...payment, status: 'failed' }, environment: 'test', observedAt: started + 1000 });
   return new Response(JSON.stringify({ ...payment, status: 'requires_customer_action' }));
  }));
  expect(await t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:refreshStatus'), { orderId })).toEqual({ status: 'failed' });
  expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 } finally { vi.useRealTimers(); }
});

test.each([null, 'requires_customer_action'])('resume returns existing checkout in %s state with GET only', async status => {
 const { t, orderId, payment } = await setup();
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 const url = 'https://test.checkout.dodopayments.com/session/session';
 await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'session', checkoutUrl: url });
 const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'session', created_at: new Date(Date.now() - 1000).toISOString(), payment_id: status ? 'pay1' : null, payment_status: status }))).mockResolvedValueOnce(new Response(JSON.stringify({ ...payment, status })));
 expect((await t.withIdentity({ subject: 'u1' }).query(ref<'query'>('payments:history'), {}))[0].canResume).toBe(true);
 vi.stubGlobal('fetch', fetchMock);
 expect(await t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:resumeCheckout'), { orderId })).toEqual({ url });
 expect(fetchMock).toHaveBeenCalledTimes(status ? 2 : 1);
 for (const call of fetchMock.mock.calls) expect(call[1].method).toBeUndefined();
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 expect(await t.run(ctx => ctx.db.query('checkoutOrders').collect())).toHaveLength(1);
});

test.each(['foreign', 'captured', 'disputed', 'old', 'missing-fields', 'wrong-host'])('resume rejects %s checkout', async scenario => {
 const { t, orderId, payment } = await setup();
 vi.stubEnv('DODO_API_KEY', 'key'); vi.stubEnv('DODO_ENVIRONMENT', 'test');
 await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'session', checkoutUrl: scenario === 'wrong-host' ? 'https://evil.test/session' : 'https://test.checkout.dodopayments.com/session/session' });
 if (scenario === 'disputed') await t.run(ctx => ctx.db.patch(orderId, { disputeReview: true }));
 const session = { id: 'session', created_at: new Date(Date.now() - (scenario === 'old' ? 24 * 3600000 : 1000)).toISOString(), payment_id: scenario === 'captured' ? 'pay1' : null, payment_status: scenario === 'captured' ? 'succeeded' : null };
 const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(scenario === 'missing-fields' ? { id: 'session' } : session))).mockResolvedValueOnce(new Response(JSON.stringify(payment)));
 vi.stubGlobal('fetch', fetchMock);
 await expect(t.withIdentity({ subject: scenario === 'foreign' ? 'other' : 'u1' }).action(ref<'action'>('payments:resumeCheckout'), { orderId })).rejects.toThrow();
 if (scenario === 'foreign') expect(fetchMock).not.toHaveBeenCalled();
 if (scenario === 'captured') expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('paid');
 expect(await t.run(ctx => ctx.db.query('checkoutOrders').collect())).toHaveLength(1);
});

test.each(['no-claim', 'wrong-total', 'wrong-business', 'processing', 'conflict'])('lost session recovery rejects %s without mutation or credits', async scenario => {
 const { t, payment } = await setup();
 const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test', requestId: 'lost-create-attempt' });
 if (scenario !== 'no-claim') await t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId });
 const snapshot = { ...payment, metadata: { orderId }, checkout_session_id: scenario === 'conflict' ? 'session' : 'new-session', ...(scenario === 'wrong-total' ? { total_amount: 1 } : {}), ...(scenario === 'wrong-business' ? { business_id: 'other' } : {}), ...(scenario === 'processing' ? { status: 'processing' } : {}) };
 await expect(t.mutation(ref<'mutation'>('payments:recoverPaidSession'), { orderId, payment: snapshot, environment: 'test' })).rejects.toThrow();
 expect((await t.run(ctx => ctx.db.get(orderId)))?.sessionId).toBeUndefined();
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});


test.each([true, false])('successful reconciliation schedules its deadline from one completion timestamp (settled=%s)', async settled => {
 const { t, orderId } = await setup();
 await t.run(ctx => ctx.db.patch(orderId, { reconcileAttempt: 1, reconcileRunning: true, paymentId: settled ? 'pay1' : undefined }));
 let clock = 1_000_000;
 const now = vi.spyOn(Date, 'now').mockImplementation(() => clock++);
 try {
  await t.mutation(ref<'mutation'>('payments:finishReconciliation'), { orderId, attempt: 1, success: true });
  const order = await t.run(ctx => ctx.db.get(orderId));
  expect(order!.nextReconcileAt! - order!.reconciledAt!).toBe(settled ? 86400000 : 900000);
 } finally { now.mockRestore(); }
});
