import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
test('purchase pages reach older refunds and keep private provider/session fields out', async () => {
 const t = convexTest(schema, modules), actor = t.withIdentity({ subject: 'owner' });
 const userId = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 123, freeUsed: 3 }));
 const ids: string[] = [];
 for (let i = 0; i < 55; i++) ids.push(await t.run(ctx => ctx.db.insert('checkoutOrders', { userId: 'owner', packId: 'starter', productId: 'provider-secret-product', environment: 'test', credits: 25, amountMinor: 999, status: i === 0 ? 'partially_refunded' : 'paid', createdAt: i + 1, paidTotalMinor: 1099, refundedAmountMinor: i === 0 ? 500 : undefined, refundedCredits: i === 0 ? 12 : undefined, sessionId: `session-${i}`, paymentId: `payment-${i}`, checkoutUrl: 'https://checkout.example/private-session' })));
 await t.run(ctx => ctx.db.insert('checkoutOrders', { userId: 'foreign', packId: 'starter', productId: 'foreign', environment: 'live', credits: 25, amountMinor: 999, status: 'paid', createdAt: 100 }));
 const rows: any[] = []; let cursor: string | null = null;
 for (let page = 0; page < 4; page++) {
  const result: any = await actor.query(ref<'query'>('payments:listHistory'), { accountKey: 'owner', paginationOpts: { numItems: 20, cursor } });
  expect(result.page.length).toBeLessThanOrEqual(20); rows.push(...result.page);
  if (result.isDone) break;
  cursor = result.continueCursor;
 }
 expect(rows).toHaveLength(55); expect(new Set(rows.map(row => row.id)).size).toBe(55);
 expect(new Set(rows.map(row => row.id))).toEqual(new Set(ids));
 const refunded = rows.find(row => row.id === ids[0]);
 expect(refunded).toMatchObject({ amountUsd: 9.99, paidAmountUsd: 10.99, refundedAmountUsd: 5, refundedCredits: 12, status: 'partially_refunded', canResume: false });
 for (const row of rows) for (const field of ['userId', 'sessionId', 'paymentId', 'checkoutUrl', 'productId']) expect(row).not.toHaveProperty(field);
 expect(await t.run(ctx => ctx.db.get(userId))).toMatchObject({ credits: 123, freeUsed: 3 });
});
test('purchase pagination validates authentication, account binding and size', async () => {
 const t = convexTest(schema, modules), actor = t.withIdentity({ subject: 'owner' });
 const request = { accountKey: 'owner', paginationOpts: { numItems: 20, cursor: null } };
 await expect(t.query(ref<'query'>('payments:listHistory'), request)).rejects.toThrow('UNAUTHENTICATED');
 expect((await actor.query(ref<'query'>('payments:listHistory'), { ...request, accountKey: 'foreign' })).page).toEqual([]);
 for (const numItems of [0, 51, 1.5]) await expect(actor.query(ref<'query'>('payments:listHistory'), { ...request, paginationOpts: { numItems, cursor: null } })).rejects.toThrow('INVALID_PAGE_SIZE');
});
