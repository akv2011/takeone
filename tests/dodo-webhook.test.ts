// @vitest-environment node
import { convexTest } from 'convex-test';
import { Webhook } from 'standardwebhooks';
import { afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
const secret = Buffer.from('a-long-test-secret-for-webhook-validation').toString('base64');
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function setup() {
  for (const [key, value] of Object.entries({ DODO_WEBHOOK_SECRET: secret, DODO_API_KEY: 'key', DODO_ENVIRONMENT: 'test', DODO_BUSINESS_ID: 'business' })) vi.stubEnv(key, value);
  return convexTest(schema, modules);
}
function signed(body: string, date = new Date()) {
  return { body, headers: { 'webhook-id': 'event1', 'webhook-timestamp': String(Math.floor(date.getTime() / 1000)), 'webhook-signature': new Webhook(secret).sign('event1', date, body) } };
}
test('rejects tampered payload, missing signature and old timestamps before provider lookup', async () => {
  const t = setup(); const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const body = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay1' } });
  for (const args of [ { ...signed(body), body: body.replace('pay1', 'pay2') }, { body, headers: {} }, signed(body, new Date(Date.now() - 600_000)) ]) {
    expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(401);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});
test('real signature verification followed by canonical lookup credits exactly once', async () => {
  const t = setup();
  await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', credits: 0, freeUsed: 0 }));
  const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test' });
  await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'session' });
  const payment = { payment_id: 'pay1', status: 'succeeded', business_id: 'business', checkout_session_id: 'session', metadata: { orderId }, currency: 'USD', total_amount: 999, tax: 0, product_cart: [{ product_id: 'product', quantity: 1 }] };
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(payment))));
  const args = signed(JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay1', metadata: { credits: '500' } } }));
  expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(200);
  expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(200);
  expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
});
test('provider failures return retryable status without changing balances', async () => {
  const t = setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
  expect(await t.action(ref<'action'>('dodoWebhook:receive'), signed(JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay1' } })))).toBe(503);
  expect(await t.run(ctx => ctx.db.query('purchases').collect())).toHaveLength(0);
});
test('signed failed-payment notification records canonical failure without adding credits', async () => {
  const t = setup();
  await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', credits: 0, freeUsed: 0 }));
  const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test' });
  await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'session' });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ payment_id: 'failed1', status: 'failed', business_id: 'business', checkout_session_id: 'session', metadata: { orderId } }))));
  const result = await t.action(ref<'action'>('dodoWebhook:receive'), signed(JSON.stringify({ type: 'payment.failed', timestamp: new Date().toISOString(), data: { payment_id: 'failed1' } })));
  expect(result).toBe(200);
  expect((await t.run(ctx => ctx.db.get(orderId)))?.status).toBe('failed');
  expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});

test.each([false, true])('signed refund fetches canonical refund and payment before adjusting credits (lost response: %s)', async lost => {
 const t = setup();
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', credits: 0, freeUsed: 0 }));
 const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test', requestId: 'recovery-notification' });
 if (lost) await t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId });
 else await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'session' });
 const refund = { refund_id: 'refund1', payment_id: 'pay1', business_id: 'business', status: 'succeeded', amount: 999, currency: 'USD' };
 const payment = { payment_id: 'pay1', status: 'succeeded', business_id: 'business', checkout_session_id: 'session', metadata: { orderId }, currency: 'USD', total_amount: 999, tax: 0, product_cart: [{ product_id: 'product', quantity: 1 }], refund_status: 'full', refunds: [refund] };
 const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/refunds/') ? refund : payment)));
 vi.stubGlobal('fetch', fetchMock);
 const args = signed(JSON.stringify({ type: 'refund.succeeded', data: { refund_id: 'refund1', amount: 1 } }));
 expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(200);
 expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(200);
 expect(fetchMock.mock.calls[0][0]).toBe('https://test.dodopayments.com/refunds/refund1');
 expect((await t.run(ctx => ctx.db.get(orderId)))?.refundedAmountMinor).toBe(999);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 expect(await t.run(ctx => ctx.db.query('paymentRefunds').collect())).toHaveLength(1);
});

test.each([false, true])('signed dispute events fetch canonical dispute and payment, recording without credit changes (lost response: %s)', async lost => {
 const t = setup();
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', credits: 0, freeUsed: 0 }));
 const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test', requestId: 'recovery-notification' });
 if (lost) await t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId });
 else await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'session' });
 const payment = { payment_id: 'pay1', status: 'succeeded', business_id: 'business', checkout_session_id: 'session', metadata: { orderId }, currency: 'USD', total_amount: 999, tax: 0, product_cart: [{ product_id: 'product', quantity: 1 }] };
 const dispute = { dispute_id: 'dp1', payment_id: 'pay1', business_id: 'business', currency: 'USD', amount: '9.99', created_at: '2026-09-01T00:00:00Z', dispute_stage: 'dispute', dispute_status: 'dispute_won' };
 const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/disputes/') ? dispute : { ...payment, disputes: [dispute] })));
 vi.stubGlobal('fetch', fetcher);
 for (const name of ['opened', 'expired', 'accepted', 'cancelled', 'challenged', 'won', 'lost']) {
  expect(await t.action(ref<'action'>('dodoWebhook:receive'), signed(JSON.stringify({ type: `dispute.${name}`, data: { dispute_id: 'dp1', payment_id: 'forged', amount: '99999' } })))).toBe(200);
 }
 expect(await t.action(ref<'action'>('dodoWebhook:receive'), signed(JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay1' } })))).toBe(200);
 expect(fetcher).toHaveBeenCalledWith('https://test.dodopayments.com/disputes/dp1', expect.anything());
 expect(fetcher).toHaveBeenCalledWith('https://test.dodopayments.com/payments/pay1', expect.anything());
 const disputes = await t.run(ctx => ctx.db.query('paymentDisputes').collect());
 expect(disputes).toHaveLength(1); expect(disputes[0]).toMatchObject({ status: 'dispute_won', amount: '9.99', paymentId: 'pay1' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.disputeReview).toBe(true);
});

test('dispute lookup failures and mismatched IDs cannot record an observation', async () => {
 const t = setup();
 const args = signed(JSON.stringify({ type: 'dispute.opened', data: { dispute_id: 'dp1' } }));
 vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
 expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(503);
 vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ dispute_id: 'other', payment_id: 'pay1' }))));
 expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(400);
 expect(await t.run(ctx => ctx.db.query('paymentDisputes').collect())).toHaveLength(0);
});

test('signed captured payment recovers a lost checkout response and grants once', async () => {
 const t = setup();
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', credits: 0, freeUsed: 0 }));
 const orderId = await t.mutation(ref<'mutation'>('payments:createOrder'), { userId: 'u1', packId: 'starter', productId: 'product', environment: 'test', requestId: 'lost-create-response' });
 await t.mutation(ref<'mutation'>('payments:claimCheckout'), { orderId });
 const payment = { payment_id: 'pay-recovered', status: 'succeeded', business_id: 'business', checkout_session_id: 'recovered-session', metadata: { orderId }, currency: 'USD', total_amount: 999, tax: 0, product_cart: [{ product_id: 'product', quantity: 1 }] };
 vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(payment))));
 const args = signed(JSON.stringify({ type: 'payment.succeeded', data: { payment_id: payment.payment_id } }));
 expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(200);
 const first = await t.run(ctx => ctx.db.get(orderId));
 expect(first).toMatchObject({ status: 'paid', sessionId: 'recovered-session', recoveredSessionPaymentId: 'pay-recovered', checkoutCreating: false });
 expect(first?.sessionRecoveredAt).toBeTypeOf('number');
 expect(await t.action(ref<'action'>('dodoWebhook:receive'), args)).toBe(200);
 expect((await t.run(ctx => ctx.db.get(orderId)))?.sessionRecoveredAt).toBe(first?.sessionRecoveredAt);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
 expect(await t.run(ctx => ctx.db.query('purchases').collect())).toHaveLength(1);
 await t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'recovered-session', checkoutUrl: 'https://test.checkout.dodopayments.com/session/recovered-session' });
 await expect(t.mutation(ref<'mutation'>('payments:attachSession'), { orderId, sessionId: 'different-session' })).rejects.toThrow();
});
