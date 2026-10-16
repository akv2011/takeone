import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100000); vi.stubEnv('TELEGRAM_BOT_TOKEN', 'fixture-token'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
 const t = convexTest(schema, modules);
 const id = await t.run(ctx => ctx.db.insert('telegramMessages', { chatId: '123', text: 'Queued', status: 'pending', attempts: 0, createdAt: Date.now(), expiresAt: Date.now() + 600000, nextAt: Date.now() }));
 return { t, id };
}
test('successful delivery checks API acceptance, stores receipt and cannot replay', async () => {
 const { t, id } = await setup();
 const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 456 } })));
 vi.stubGlobal('fetch', fetcher);
 await t.action(ref<'action'>('telegramMessages:deliver'), { messageId: id });
 await t.action(ref<'action'>('telegramMessages:deliver'), { messageId: id });
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: 'sent', attempts: 1, deliveredAt: 100000, messageId: 456 });
 expect((await t.run(ctx => ctx.db.get(id)))?.text).toBeUndefined();
});
test('API failure with HTTP 200 respects retry_after and succeeds only after the delay', async () => {
 const { t, id } = await setup();
 const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 90 } }))).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
 vi.stubGlobal('fetch', fetcher);
 await t.action(ref<'action'>('telegramMessages:deliver'), { messageId: id });
 expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: 'pending', nextAt: 190000 });
 await t.action(ref<'action'>('telegramMessages:deliver'), { messageId: id });
 expect(fetcher).toHaveBeenCalledTimes(1);
 vi.setSystemTime(190000);
 await t.action(ref<'action'>('telegramMessages:deliver'), { messageId: id });
 expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe('sent');
});
test('stopped sends recover with a new attempt and ignore stale completion', async () => {
 const { t, id } = await setup();
 const claim = () => t.mutation(ref<'mutation'>('telegramMessages:claim'), { messageId: id });
 expect(await claim()).toMatchObject({ attempt: 1 });
 expect(await claim()).toBeNull();
 vi.setSystemTime(160000);
 await t.mutation(ref<'mutation'>('telegramMessages:recover'), {});
 const scheduled = await t.run(ctx => ctx.db.system.query('_scheduled_functions').collect());
 expect(scheduled.some(row => JSON.stringify(row.args).includes(id))).toBe(true);
 expect(await claim()).toMatchObject({ attempt: 2 });
 await t.mutation(ref<'mutation'>('telegramMessages:finish'), { messageId: id, attempt: 1, success: true });
 expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe('sending');
 await t.mutation(ref<'mutation'>('telegramMessages:finish'), { messageId: id, attempt: 2, success: true });
 expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe('sent');
});
test('transport failures stop after three attempts without storing provider secrets', async () => {
 const { t, id } = await setup();
 vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret-token-in-url')));
 for (let attempt = 0; attempt < 3; attempt++) {
  await t.action(ref<'action'>('telegramMessages:deliver'), { messageId: id });
  vi.setSystemTime(Date.now() + 60000);
 }
 const row = await t.run(ctx => ctx.db.get(id));
 expect(row).toMatchObject({ status: 'failed', attempts: 3 });
 expect(row?.text).toBeUndefined();
 expect(JSON.stringify(row)).not.toContain('secret-token');
});
test('expired messages never contact Telegram and recipient rejection is terminal', async () => {
 const { t, id } = await setup();
 const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error_code: 403 }), { status: 403 }));
 vi.stubGlobal('fetch', fetcher);
 await t.action(ref<'action'>('telegramMessages:deliver'), { messageId: id });
 expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: 'failed', error: 'recipient_rejected' });
 const second = await setup(); vi.setSystemTime(Date.now() + 600001);
 await second.t.action(ref<'action'>('telegramMessages:deliver'), { messageId: second.id });
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await second.t.run(ctx => ctx.db.get(second.id))).toMatchObject({ status: 'failed', error: 'expired', attempts: 0 });
});
