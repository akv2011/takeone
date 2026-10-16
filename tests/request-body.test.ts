import { afterEach, expect, test, vi } from 'vitest';
import { readRequestText } from '../convex/requestBody';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
function request(chunks: Uint8Array[], headers = {}, cancel = vi.fn()) {
 const stream = new ReadableStream<Uint8Array>({ pull(controller) { const chunk = chunks.shift(); if (chunk) controller.enqueue(chunk); else controller.close(); }, cancel });
 return new Request('https://test/webhook', { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit);
}
test('preserves exact UTF-8 bytes split across chunks, including BOM and line endings', async () => {
 const text = '\uFEFF{"message":"🎬 café"}\r\n'; const bytes = new TextEncoder().encode(text);
 expect(await readRequestText(request(Array.from(bytes, byte => new Uint8Array([byte]))), bytes.length)).toBe(text);
});
test.each([{}, { 'content-length': '1' }])('caps actual bytes with missing or misleading lengths', async headers => {
 const cancel = vi.fn();
 await expect(readRequestText(request([new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)], headers, cancel), 5)).rejects.toMatchObject({ status: 413 });
 expect(cancel).toHaveBeenCalledOnce();
});
test('rejects oversized declared length before retaining payload', async () => {
 const cancel = vi.fn();
 await expect(readRequestText(request([new Uint8Array(1)], { 'content-length': '999' }, cancel), 5)).rejects.toMatchObject({ status: 413 });
 expect(cancel).toHaveBeenCalledOnce();
});
test('rejects malformed UTF-8 rather than changing signed text', async () => {
 await expect(readRequestText(request([new Uint8Array([0xc3, 0x28])]), 5)).rejects.toMatchObject({ status: 400 });
});
test('stalled reads time out and cancel their stream', async () => {
 vi.useFakeTimers(); const cancel = vi.fn();
 const req = new Request('https://test', { method: 'POST', body: new ReadableStream({ cancel }), duplex: 'half' } as RequestInit);
 const pending = expect(readRequestText(req, 5, 100)).rejects.toMatchObject({ status: 408 });
 await vi.advanceTimersByTimeAsync(100); await pending;
 expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
test('both HTTP routes reject oversized multibyte bodies before dispatch', async () => {
 vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'secret'); vi.stubEnv('DODO_WEBHOOK_SECRET', 'secret');
 const t = convexTest(schema, modules);
 for (const [path, cap] of [['/telegram', 65536], ['/dodo-webhook', 262144]] as const) {
  const body = '🎬'.repeat(Math.floor(cap / 4) + 1);
  expect(body.length).toBeLessThan(cap);
  const response = await t.fetch(path, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'secret', 'content-length': '1' }, body });
  expect(response.status).toBe(413);
 }
 expect(await t.run(ctx => ctx.db.query('telegramUpdates').collect())).toEqual([]);
 expect(await t.run(ctx => ctx.db.query('purchases').collect())).toEqual([]);
});
test('authentication and disabled integration checks still precede body reading', async () => {
 vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'secret'); vi.stubEnv('DODO_WEBHOOK_SECRET', '');
 const t = convexTest(schema, modules);
 const payload = { method: 'POST', headers: { 'content-length': '999999' }, body: 'body' };
 expect((await t.fetch('/telegram', payload)).status).toBe(401);
 expect((await t.fetch('/dodo-webhook', payload)).status).toBe(503);
});
test('source failure returns a safe body error and clears the deadline', async () => {
 vi.useFakeTimers();
 const stream = new ReadableStream({ start(controller) { controller.error(Error('private upstream details')); } });
 const req = new Request('https://test', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
 await expect(readRequestText(req, 8)).rejects.toMatchObject({ status: 400, message: 'Invalid request body' });
 expect(vi.getTimerCount()).toBe(0);
});
