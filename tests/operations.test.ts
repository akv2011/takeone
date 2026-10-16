import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import { snapshot, logHealth, launchReadiness, QUEUE_WARNING_MS } from '../convex/operations';
const modules = import.meta.glob('../convex/**/*.ts');
const read = (t: ReturnType<typeof convexTest>) => t.query(ref<'query'>('operations:snapshot'), {});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T10:00:00Z')); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); });
const job = (status: string, createdAt = Date.now()) => ({ userId: 'private-user', prompt: 'private prompt', mode: 'generate', status, createdAt });
test('operator functions are internal and empty state makes no provider-readiness claim', async () => {
 expect(snapshot.isInternal).toBe(true); expect(logHealth.isInternal).toBe(true); expect(launchReadiness.isInternal).toBe(true);
 expect(await read(convexTest(schema, modules))).toEqual({ observedAt: Date.now(), oldestQueueWaitMs: null, expiredWorkerLease: false, failedTelegramVideo: false, failedTelegramText: false, issues: [] });
});
test('launch readiness reports aggregate capability gaps and legacy active jobs without private data', async () => {
 vi.stubEnv('DISPATCH_URL', '');
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('genJobs', job('queued')));
 const result = await t.query(ref<'query'>('operations:launchReadiness'), {});
 expect(result.ready).toBe(false);
 expect(result.activeLegacyJobs).toBe(1);
 expect(result.legacyJobsTruncated).toBe(false);
 expect(result.missing).toEqual(expect.arrayContaining(['rendering', 'stockVideo', 'youtubeClips', 'payments', 'telegram']));
 expect(result.configuredProject).toBeNull();
 expect(JSON.stringify(result)).not.toContain('private');
});
test('queue age uses createdAt rather than insertion order and respects the exact boundary', async () => {
 const t = convexTest(schema, modules);
 await t.run(async ctx => { await ctx.db.insert('genJobs', job('queued')); await ctx.db.insert('genJobs', job('queued', Date.now() - QUEUE_WARNING_MS)); });
 expect(await read(t)).toMatchObject({ oldestQueueWaitMs: QUEUE_WARNING_MS, issues: [] });
 vi.setSystemTime(Date.now() + 1);
 expect(await read(t)).toMatchObject({ oldestQueueWaitMs: QUEUE_WARNING_MS + 1, issues: ['QUEUE_WAIT_HIGH'] });
});
test('expired or missing active leases are detected, while terminal and future leases are ignored', async () => {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => [
  await ctx.db.insert('genJobs', { ...job('processing'), leaseExpiresAt: Date.now() + 1 }),
  await ctx.db.insert('genJobs', { ...job('done'), leaseExpiresAt: Date.now() - 10 }),
 ]);
 expect((await read(t)).expiredWorkerLease).toBe(false);
 vi.setSystemTime(Date.now() + 1);
 expect((await read(t)).issues).toEqual(['WORKER_LEASE_EXPIRED']);
 await t.run(async ctx => { await ctx.db.patch(ids[0], { status: 'failed' }); await ctx.db.insert('genJobs', job('dispatched')); });
 expect((await read(t)).expiredWorkerLease).toBe(true);
});
test('failed delivery flags include historical failures and clear when no failures remain; reads do not mutate jobs', async () => {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => ({
  video: await ctx.db.insert('genJobs', { ...job('done', 1), telegramDeliveryStatus: 'failed', storageKey: 'private-key', telegramChatId: 'private-chat' }),
  text: await ctx.db.insert('telegramMessages', { chatId: 'private-chat', text: 'private text', status: 'failed', attempts: 3, createdAt: 1, expiresAt: 2, nextAt: 2 }),
 }));
 const before = await t.run(ctx => ctx.db.get(ids.video));
 expect((await read(t)).issues).toEqual(['TELEGRAM_VIDEO_FAILED', 'TELEGRAM_TEXT_FAILED']);
 expect(await t.run(ctx => ctx.db.get(ids.video))).toEqual(before);
 await t.run(async ctx => { await ctx.db.patch(ids.video, { telegramDeliveryStatus: 'sent' }); await ctx.db.patch(ids.text, { status: 'sent' }); });
 expect((await read(t)).issues).toEqual([]);
});
test('periodic logging contains only the explicit aggregate projection', async () => {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('genJobs', { ...job('processing'), leaseToken: 'private-lease', error: 'private provider response', resultUrl: 'https://private.example/video' }));
 const log = vi.spyOn(console, 'info').mockImplementation(() => {});
 await t.action(ref<'action'>('operations:logHealth'), {});
 expect(log).toHaveBeenCalledOnce();
 const payload = JSON.parse(log.mock.calls[0][0]);
 expect(payload).toEqual({ event: 'takeone.operations', observedAt: Date.now(), oldestQueueWaitMs: null, expiredWorkerLease: true, failedTelegramVideo: false, failedTelegramText: false, issues: ['WORKER_LEASE_EXPIRED'] });
 expect(JSON.stringify(payload)).not.toContain('private');
});

test('legacy readiness finds jobs beyond the first 101 managed jobs in each state', async () => {
 const t = convexTest(schema, modules);
 await t.run(async ctx => {
  for (const status of ['queued', 'dispatched', 'processing']) {
   for (let i = 0; i < 102; i++) await ctx.db.insert('genJobs', { ...job(status, i), reservation: 'free' });
   await ctx.db.insert('genJobs', job(status, 1000));
  }
  await ctx.db.insert('genJobs', job('done', 1000));
 });
 const result = await t.query(ref<'query'>('operations:launchReadiness'), {});
 expect(result.activeLegacyJobs).toBe(3);
 expect(result.legacyJobsTruncated).toBe(false);
 expect(result.ready).toBe(false);
 expect(JSON.stringify(result)).not.toContain('private');
});
test('legacy readiness caps the total and explicitly reports truncation', async () => {
 const t = convexTest(schema, modules);
 await t.run(async ctx => {
  for (let i = 0; i < 105; i++) await ctx.db.insert('genJobs', job('queued', i));
 });
 const result = await t.query(ref<'query'>('operations:launchReadiness'), {});
 expect(result.activeLegacyJobs).toBe(100);
 expect(result.legacyJobsTruncated).toBe(true);
});
