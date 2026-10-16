import { convexTest } from 'convex-test';
import { makeFunctionReference as ref } from 'convex/server';
import { expect, test } from 'vitest';
import schema from '../convex/schema';
import { list, detail, disputes } from '../convex/paymentReview';
const modules = import.meta.glob('../convex/**/*.ts');
const order = (patch = {}) => ({ userId: 'private-user', packId: 'starter', productId: 'private-product', environment: 'test', credits: 25, amountMinor: 999, status: 'paid', createdAt: 1, checkoutUrl: 'https://checkout.example/private-token', ...patch });
const pageOpts = { numItems: 50, cursor: null };

test('payment review queries are internal-only', () => {
 for (const query of [list, detail, disputes]) expect(query.isInternal).toBe(true);
});
test('dispute queue paginates beyond fifty in created order and isolates live orders', async () => {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const rows = [];
  for (let i = 64; i >= 0; i--) rows.push(await ctx.db.insert('checkoutOrders', order({ createdAt: i, disputeReview: true })));
  await ctx.db.insert('checkoutOrders', order({ environment: 'live', disputeReview: true }));
  await ctx.db.insert('checkoutOrders', order({ disputeReview: false }));
  return rows.reverse();
 });
 const seen: string[] = []; let cursor: string | null = null;
 do {
  const result = await t.query(ref<'query'>('paymentReview:list'), { environment: 'test', kind: 'disputes', paginationOpts: { numItems: 25, cursor } });
  expect(result.page.length).toBeLessThanOrEqual(25);
  expect(JSON.stringify(result)).not.toContain('private');
  seen.push(...result.page.map((row: any) => row.orderId));
  cursor = result.isDone ? null : result.continueCursor;
 } while (cursor);
 expect(seen).toEqual(ids);
});
test('missing-session and provider-failure queues select only their own recorded condition', async () => {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => ({
  missing: await ctx.db.insert('checkoutOrders', order({ reconcileError: 'missing_session_review_required' })),
  failed: await ctx.db.insert('checkoutOrders', order({ reconcileError: 'provider_check_failed' })),
  raw: await ctx.db.insert('checkoutOrders', order({ reconcileError: 'private provider response' })),
 }));
 for (const [kind, id] of [['missing_session', ids.missing], ['provider_failure', ids.failed]]) {
  const result = await t.query(ref<'query'>('paymentReview:list'), { environment: 'test', kind, paginationOpts: pageOpts });
  expect(result.page).toHaveLength(1); expect(result.page[0]).toMatchObject({ orderId: id, reconciliationIssue: kind });
 }
});
test('case details preserve saved facts without mutating balances or exposing bearer URLs and identities', async () => {
 const t = convexTest(schema, modules);
 const { id, user } = await t.run(async ctx => ({
  id: await ctx.db.insert('checkoutOrders', order({ sessionId: 'session-ref', paymentId: 'payment-ref', paidTotalMinor: 1099, refundedAmountMinor: 500, refundedCredits: 12, disputeReview: true, reconcileError: 'private error' })),
  user: await ctx.db.insert('users', { tokenIdentifier: 'private-user', credits: 13, freeUsed: 3 }),
 }));
 const before = await t.run(async ctx => ({ order: await ctx.db.get(id), user: await ctx.db.get(user) }));
 const result = await t.query(ref<'query'>('paymentReview:detail'), { environment: 'test', orderId: id });
 expect(result).toMatchObject({ source: 'saved_observations', automaticResolutionAvailable: false, order: { sessionId: 'session-ref', paymentId: 'payment-ref', capturedMinorUsd: 1099, refundedMinorUsd: 500, creditsPurchased: 25, creditsRefunded: 12, disputeReview: true } });
 expect(JSON.stringify(result)).not.toContain('private');
 expect(await t.query(ref<'query'>('paymentReview:detail'), { environment: 'live', orderId: id })).toBeNull();
 expect(await t.run(async ctx => ({ order: await ctx.db.get(id), user: await ctx.db.get(user) }))).toEqual(before);
});
test('dispute pages preserve raw amounts and isolate order references across multiple pages', async () => {
 const t = convexTest(schema, modules);
 const { id, other } = await t.run(async ctx => ({ id: await ctx.db.insert('checkoutOrders', order({ paymentId: 'payment' })), other: await ctx.db.insert('checkoutOrders', order()) }));
 await t.run(async ctx => {
  for (let i = 0; i < 55; i++) await ctx.db.insert('paymentDisputes', { orderId: id, reference: `dispute-${i}`, paymentId: 'payment', environment: 'test', amount: '999999999999999999.123456789', currency: 'USD', status: 'dispute_opened', stage: 'dispute', providerCreatedAt: i, observedAt: i + 1 });
  await ctx.db.insert('paymentDisputes', { orderId: other, reference: 'other-order', paymentId: 'other-payment', environment: 'test', amount: '2', currency: 'USD', status: 'dispute_won', stage: 'dispute', providerCreatedAt: 1, observedAt: 2 });
 });
 let cursor: string | null = null; const references: string[] = [];
 do {
  const result = await t.query(ref<'query'>('paymentReview:disputes'), { environment: 'test', orderId: id, paginationOpts: { numItems: 20, cursor } });
  expect(result.amountUnits).toBe('unverified_provider_units');
  for (const row of result.page) { expect(row.providerAmountRaw).toBe('999999999999999999.123456789'); references.push(row.reference); }
  cursor = result.isDone ? null : result.continueCursor;
 } while (cursor);
 expect(references).toHaveLength(55); expect(references).not.toContain('other-order');
 await expect(t.query(ref<'query'>('paymentReview:disputes'), { environment: 'live', orderId: id, paginationOpts: pageOpts })).rejects.toThrow('REVIEW_ORDER_UNAVAILABLE');
});
test('oversized pages and inconsistent dispute bindings fail closed', async () => {
 const t = convexTest(schema, modules);
 const id = await t.run(ctx => ctx.db.insert('checkoutOrders', order({ paymentId: 'expected' })));
 for (const numItems of [0, -1, 51, 1.5]) await expect(t.query(ref<'query'>('paymentReview:list'), { environment: 'test', kind: 'disputes', paginationOpts: { numItems, cursor: null } })).rejects.toThrow();
 await expect(t.query(ref<'query'>('paymentReview:disputes'), { environment: 'test', orderId: id, paginationOpts: { numItems: 51, cursor: null } })).rejects.toThrow('REVIEW_PAGE_SIZE');
 await t.run(ctx => ctx.db.insert('paymentDisputes', { orderId: id, reference: 'bad-binding', paymentId: 'wrong-payment', environment: 'test', amount: '1', currency: 'USD', status: 'dispute_opened', stage: 'dispute', providerCreatedAt: 1, observedAt: 2 }));
 await expect(t.query(ref<'query'>('paymentReview:disputes'), { environment: 'test', orderId: id, paginationOpts: pageOpts })).rejects.toThrow('REVIEW_DISPUTE_BINDING');
});
