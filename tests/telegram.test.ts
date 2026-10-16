import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'secret'); vi.stubEnv('TELEGRAM_BOT_USERNAME', 'Takeone_test_bot'); vi.stubEnv('APP_URL', 'https://takeone.web.app'); vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', freeUsed: 0, credits: 0 }));
 const link = await t.withIdentity({ subject: 'u1' }).mutation(ref<'mutation'>('telegram:createLink'), {});
 return { t, link };
}
const update = (update_id: number, text: string) => ({ update_id, message: { from: { id: 123 }, chat: { id: 123, type: 'private' }, text } });
const receive = (t: ReturnType<typeof convexTest>, id: number, text: string) => t.mutation(ref<'mutation'>('telegram:receive'), { update: update(id, text) });
test('webhook rejects forged updates and invalid JSON', async () => {
 const { t } = await setup();
 expect((await t.fetch('/telegram', { method: 'POST', body: '{}' })).status).toBe(401);
 expect((await t.fetch('/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'secret' }, body: '{' })).status).toBe(400);
});
test('linked Telegram reuses web balance, persists confirmation and deduplicates updates', async () => {
 const { t, link } = await setup();
 await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, 'https://youtu.be/abcdefghijk');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 await receive(t, 3, 'yes'); await receive(t, 3, 'yes');
 const jobs = await t.run(ctx => ctx.db.query('genJobs').collect());
 expect(jobs).toHaveLength(1); expect(jobs[0]).toMatchObject({ userId: 'u1', mode: 'clip', telegramChatId: '123' });
 expect(await t.run(ctx => ctx.db.query('telegramMessages').collect())).toHaveLength(3);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
test('expired codes and unlinked accounts cannot submit jobs', async () => {
 const { t, link } = await setup(); vi.setSystemTime(Date.now() + 601_000);
 await receive(t, 1, `/link ${link.code}`); await receive(t, 2, 'A video about space');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
});
test('free quota remains exhausted across new Telegram updates', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await t.run(async ctx => { const u = await ctx.db.query('users').first(); await ctx.db.patch(u!._id, { freeUsed: 3 }); });
 await receive(t, 2, 'A reel about space');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
});

test('a full global queue gives a retry message without a debit or hidden later submission', async () => {
 const { t, link } = await setup();
 await receive(t, 1, `/link ${link.code}`);
 await t.run(async ctx => {
  for (let i = 0; i < 1000; i++) await ctx.db.insert('genJobs', { userId: `other-${i}`, mode: 'generate', prompt: 'A queued video', status: 'queued', createdAt: Date.now() });
 });
 await receive(t, 2, 'A reel about mountains');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 expect(await t.run(ctx => ctx.db.query('genJobs').withIndex('by_user', q => q.eq('userId', 'u1')).collect())).toHaveLength(0);
 const replies = await t.run(ctx => ctx.db.query('telegramMessages').collect());
 expect(JSON.stringify(replies.map(row => row.text))).toContain('The video queue is full. No generation was used.');
 await t.run(async ctx => { const job = await ctx.db.query('genJobs').first(); await ctx.db.patch(job!._id, { status: 'done' }); });
 await receive(t, 2, 'A reel about mountains');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 await receive(t, 3, 'A reel about mountains');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
 expect(await t.run(ctx => ctx.db.query('genJobs').withIndex('by_user', q => q.eq('userId', 'u1')).collect())).toHaveLength(1);
});
test('unverified payment webhook cannot mint credits', async () => {
 const { t } = await setup();
 const response = await t.fetch('/dodo-webhook', { method: 'POST', body: JSON.stringify({ type: 'payment.succeeded', metadata: { tokenIdentifier: 'u1', credits: 500 } }) });
 expect(response.status).toBe(503);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(0);
});
test('delivery outbox recovers interrupted sends without re-rendering or charging', async () => {
 const { t, link } = await setup(); await receive(t, 900, `/link ${link.code}`);
 const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'u1', mode: 'generate', prompt: 'A finished video', status: 'done', createdAt: Date.now(), storageKey: 'videos/job/token.mp4', telegramChatId: '123', telegramDeliveryStatus: 'pending' }));
 const claim = () => t.mutation(ref<'mutation'>('telegramDelivery:claim'), { jobId });
 const first = await claim(); expect(first.attempt).toBe(1); expect(await claim()).toBeNull();
 vi.setSystemTime(Date.now() + 121_000);
 await t.mutation(ref<'mutation'>('telegramDelivery:recover'), {});
 const second = await claim(); expect(second.attempt).toBe(2);
 await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt: 1, success: true, messageId: 999 });
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramMessageId).toBeUndefined();
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveryStatus).toBe('sending');
 await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt: 2, success: true, messageId: 1000 });
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramMessageId).toBe(1000);
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveryStatus).toBe('sent');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});
test('checkout stays closed even with a provider key until integration is enabled', async () => {
 const { t } = await setup(); vi.stubEnv('DODO_API_KEY', 'test-key');
 await expect(t.withIdentity({ subject: 'u1' }).action(ref<'action'>('payments:createCheckout'), { packId: 'starter', requestId: 'checkout-disabled-test', returnUrl: 'https://takeone.web.app/create' })).rejects.toThrow();
});

test('Telegram music selection is free, account-scoped and snapshotted into each render', async () => {
 const { t, link } = await setup();
 vi.stubEnv('MUSIC_CATALOG_JSON', JSON.stringify([{ id: 'upbeat', label: 'Upbeat', storageKey: 'music/upbeat.mp3', attribution: 'Licensed test track' }]));
 await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, '/music'); await receive(t, 3, '/music upbeat 25');
 await receive(t, 4, '/unknown');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 await receive(t, 5, 'A reel about mountains'); await receive(t, 5, 'A reel about mountains');
 const jobs = await t.run(ctx => ctx.db.query('genJobs').collect());
 expect(jobs).toHaveLength(1);
 expect(jobs[0].music).toMatchObject({ trackId: 'upbeat', volume: 0.25, duck: true, storageKey: 'music/upbeat.mp3' });
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u2', freeUsed: 0, credits: 0 }));
 const secondLink = await t.withIdentity({ subject: 'u2' }).mutation(ref<'mutation'>('telegram:createLink'), {});
 const sendOther = (id: number, text: string) => t.mutation(ref<'mutation'>('telegram:receive'), { update: { update_id: id, message: { from: { id: 456 }, chat: { id: 456, type: 'private' }, text } } });
 await sendOther(6, `/link ${secondLink.code}`); await sendOther(7, 'A reel about the ocean');
 expect((await t.run(ctx => ctx.db.query('genJobs').collect())).find(j => j.userId === 'u2')?.music).toBeUndefined();
 await receive(t, 8, '/music off'); await receive(t, 9, 'Another reel about mountains');
 expect((await t.run(ctx => ctx.db.query('genJobs').collect())).find(j => j.requestId === 'telegram-9')?.music).toBeUndefined();
});

test('invalid and removed soundtrack choices do not consume allowance', async () => {
 const { t, link } = await setup();
 await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, '/music');
 vi.stubEnv('MUSIC_CATALOG_JSON', JSON.stringify([{ id: 'upbeat', label: 'Upbeat', storageKey: 'music/upbeat.mp3', attribution: 'Licensed test track' }]));
 await receive(t, 3, '/music missing'); await receive(t, 4, '/music upbeat 101'); await receive(t, 5, '/music upbeat NaN');
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.music).toBeUndefined();
 await receive(t, 6, '/music upbeat');
 vi.stubEnv('MUSIC_CATALOG_JSON', '[]');
 await receive(t, 7, 'A reel about mountains');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 await receive(t, 8, '/music off'); await receive(t, 9, 'A reel about mountains');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(1);
});

test('Telegram replacement is explicit, warns about speech removal and snapshots only future renders', async () => {
 const { t, link } = await setup();
 vi.stubEnv('MUSIC_CATALOG_JSON', JSON.stringify([{ id: 'upbeat', label: 'Upbeat', storageKey: 'music/upbeat.mp3', attribution: 'Licensed test track' }]));
 await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, '/music upbeat 30 replace');
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.music).toMatchObject({ replaceSourceAudio: true, duck: false, volume: 0.3 });
 const scheduled = await t.run(ctx => ctx.db.query('telegramMessages').collect());
 expect(JSON.stringify(scheduled.map(row => row.text))).toContain('WARNING: ALL original audio, including speech');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 await receive(t, 3, 'A reel about mountains');
 await receive(t, 4, '/music upbeat 30 invalid');
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.music?.replaceSourceAudio).toBe(true);
 await receive(t, 5, '/music upbeat 30 mix');
 await receive(t, 6, 'A reel about oceans');
 const jobs = await t.run(ctx => ctx.db.query('genJobs').collect());
 expect(jobs.find(j => j.requestId === 'telegram-3')?.music).toMatchObject({ replaceSourceAudio: true, duck: false });
 expect(jobs.find(j => j.requestId === 'telegram-6')?.music).toMatchObject({ replaceSourceAudio: false, duck: true });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(2);
 await receive(t, 7, '/music upbeat 30 replace');
 await receive(t, 8, '/music upbeat');
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.music).toMatchObject({ replaceSourceAudio: false, duck: true, volume: 0.2 });
});

test('unsupported Telegram attachments cannot silently start a charged generation', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await t.mutation(ref<'mutation'>('telegram:receive'), { update: { update_id: 2, message: { from: { id: 123 }, chat: { id: 123, type: 'private' }, sticker: { file_id: 'sticker' } } } });
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('Telegram delivery timing includes retries and ignores stale acknowledgements', async () => {
 const { t, link } = await setup(); await receive(t, 900, `/link ${link.code}`); vi.setSystemTime(10000);
 const log = vi.spyOn(console, 'log').mockImplementation(() => {});
 try {
  const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'u1', mode: 'generate', prompt: 'A finished video', status: 'done', createdAt: 1000, finishedAt: 9000, storageKey: 'videos/job/token.mp4', telegramChatId: '123', telegramDeliveryStatus: 'pending' }));
  await t.mutation(ref<'mutation'>('telegramDelivery:claim'), { jobId });
  vi.setSystemTime(11000);
  await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt: 1, success: false });
  expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveredAt).toBeUndefined();
  vi.setSystemTime(41000);
  await t.mutation(ref<'mutation'>('telegramDelivery:claim'), { jobId });
  await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt: 1, success: true });
  expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveredAt).toBeUndefined();
  vi.setSystemTime(43000);
  await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt: 2, success: true });
  expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveredAt).toBe(43000);
  const events = log.mock.calls.map(([line]) => JSON.parse(line));
  expect(events).toHaveLength(4);
  expect(events.find(e => e.stage === 'telegram_total')).toMatchObject({ durationMs: 42000, success: true });
  expect(events.find(e => e.stage === 'telegram_after_render')).toMatchObject({ durationMs: 34000 });
  expect(events.filter(e => e.stage === 'telegram_api_delivery').map(e => [e.durationMs, e.success])).toEqual([[1000, false], [2000, true]]);
  expect(JSON.stringify(events)).not.toContain('storageKey');
 } finally { log.mockRestore(); }
});

test('Telegram caption preferences are free, replay safe and snapshotted per request', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, '/captions bold'); await receive(t, 2, '/captions bold');
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.captionStyle).toBe('meme');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 await receive(t, 3, 'Make a reel about space');
 await receive(t, 4, '/captions none');
 await receive(t, 5, 'Make a reel about oceans');
 await receive(t, 6, '/captions auto');
 await receive(t, 7, 'Make a reel about forests with clean captions');
 const jobs = await t.run(ctx => ctx.db.query('genJobs').collect());
 expect(jobs.map(j => j.captionStyle)).toEqual(['meme', 'none', undefined]);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(3);
 await receive(t, 8, '/captions pop');
 await receive(t, 9, '/captions');
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.captionStyle).toBe('karaoke');
 const replies = await t.run(ctx => ctx.db.query('telegramMessages').collect());
 expect(replies.at(-1)?.text).toContain('short-phrase pop-in');
 expect(replies.at(-1)?.text).toContain('Existing text in source footage remains');
});

test('invalid caption commands leave the preference unchanged and never render', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, '/captions clean');
 for (const [i, command] of ['/captions unknown', '/captions bold extra', '/captions constructor', '/captions __proto__'].entries()) await receive(t, i + 3, command);
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.captionStyle).toBe('clean');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('caption choices remain isolated between linked Telegram users', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u2', freeUsed: 0, credits: 0 }));
 const otherLink = await t.withIdentity({ subject: 'u2' }).mutation(ref<'mutation'>('telegram:createLink'), {});
 const other = (id: number, text: string) => t.mutation(ref<'mutation'>('telegram:receive'), { update: { update_id: id, message: { from: { id: 456 }, chat: { id: 456, type: 'private' }, text } } });
 await other(2, `/link ${otherLink.code}`);
 await receive(t, 3, '/captions bold'); await other(4, '/captions clean');
 await receive(t, 5, 'Make a reel about space'); await other(6, 'Make a reel about mountains');
 const jobs = await t.run(ctx => ctx.db.query('genJobs').collect());
 expect(jobs.find(j => j.userId === 'u1')).toMatchObject({ captionStyle: 'meme', telegramChatId: '123' });
 expect(jobs.find(j => j.userId === 'u2')).toMatchObject({ captionStyle: 'clean', telegramChatId: '456' });
});

test('caption preference reaches confirmed clips and uploaded-video edits', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, '/captions none');
 await receive(t, 3, 'https://youtu.be/abcdefghijk');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 await receive(t, 4, 'yes');
 await t.mutation(ref<'mutation'>('telegram:receive'), { update: { update_id: 5, message: { from: { id: 123 }, chat: { id: 123, type: 'private' }, caption: 'Make this square', video: { file_id: 'telegram-video-fixture', file_size: 1024, mime_type: 'video/mp4' } } } });
 const jobs = await t.run(ctx => ctx.db.query('genJobs').collect());
 expect(jobs.find(j => j.mode === 'clip')).toMatchObject({ captionStyle: 'none' });
 expect(jobs.find(j => j.mode === 'edit')).toMatchObject({ captionStyle: 'none', telegramFileId: 'telegram-video-fixture', aspect: '1:1' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(2);
});

async function delivered(t: ReturnType<typeof convexTest>, userId = 'u1', chatId = '123', messageId = 100) {
 const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId, mode: 'generate', prompt: 'A delivered video', aspect: '1:1', status: 'done', createdAt: Date.now(), storageKey: `videos/source-${messageId}/lease.mp4`, telegramChatId: chatId, telegramMessageId: messageId, telegramDeliveryStatus: 'pending' }));
 await t.mutation(ref<'mutation'>('telegramDelivery:claim'), { jobId });
 await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt: 1, success: true, messageId });
 return jobId;
}
const replyEdit = (t: ReturnType<typeof convexTest>, id: number, messageId: number, text: string) => t.mutation(ref<'mutation'>('telegram:receive'), { update: { ...update(id, text), message: { ...update(id, text).message, reply_to_message: { message_id: messageId } } } });

test('reply edit uses owned delivery, preserves ancestry/aspect and charges once', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const sourceId = await delivered(t);
 await receive(t, 2, '/captions bold');
 await replyEdit(t, 3, 100, 'trim 00:01 to 00:03'); await replyEdit(t, 3, 100, 'trim 00:01 to 00:03');
 const edit = await t.run(ctx => ctx.db.query('genJobs').filter(q => q.eq(q.field('mode'), 'edit')).first());
 expect(edit).toMatchObject({ parentJobId: sourceId, rootJobId: sourceId, sourceStorageKey: 'videos/source-100/lease.mp4', aspect: '1:1', telegramChatId: '123' });
 expect(edit?.captionStyle).toBe('none'); expect(edit?.music).toBeUndefined();
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});

test('unknown and cross-account reply sources never enqueue or debit', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await delivered(t, 'u2', '123', 101); await delivered(t, 'u1', '456', 102);
 for (const [i, id] of [999, 101, 102].entries()) await replyEdit(t, i + 2, id, 'make it square');
 expect((await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.mode === 'edit')).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('unsupported reply edits reject without billing and confirmation replies still work', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`); await delivered(t);
 for (const [i, text] of ['add captions', 'make a meme', '', 'please do magic', 'trim this please', 'clip https://youtu.be/abcdefghijk'].entries()) await replyEdit(t, i + 2, 100, text);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 await receive(t, 10, 'https://youtu.be/abcdefghijk');
 await replyEdit(t, 11, 999, 'yes');
 expect((await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.mode === 'clip')).toHaveLength(1);
});

test('sendVideo records its returned message only for the expected chat', async () => {
 const { t, link } = await setup(); await receive(t, 900, `/link ${link.code}`);
 vi.stubEnv('TELEGRAM_BOT_TOKEN', 'fixture'); vi.stubEnv('DISPATCH_URL', 'https://dispatcher.test'); vi.stubEnv('DISPATCH_SECRET', 'fixture');
 try {
  for (const [i, returnedChat] of ['123', '999'].entries()) {
   const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'u1', mode: 'generate', prompt: 'A delivered video', status: 'done', createdAt: Date.now(), storageKey: 'videos/source/lease.mp4', telegramChatId: '123', telegramDeliveryStatus: 'pending' }));
   vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/sign') ? { url: 'https://storage.test/video.mp4' } : { ok: true, result: { message_id: 200 + i, chat: { id: Number(returnedChat) } } }), { status: 200 })));
   await t.action(ref<'action'>('telegramDelivery:send'), { jobId });
   const job = await t.run(ctx => ctx.db.get(jobId));
   expect(job?.telegramMessageId).toBe(returnedChat === '123' ? 200 : undefined);
  }
 } finally { vi.unstubAllGlobals(); }
});

test.each([['clean', 'clean'], ['bold', 'meme'], ['pop', 'karaoke'], ['none', 'none']])('caption reply %s uses the owned clean layer and one allowance', async (choice, style) => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const source = await delivered(t);
 const music = { trackId: 'licensed', label: 'Track', storageKey: 'music/track.mp3', attribution: 'Artist', volume: 0.2, duck: true };
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json', music }));
 await receive(t, 2, '/captions bold');
 await replyEdit(t, 3, 100, `captions ${choice}`); await replyEdit(t, 3, 100, `captions ${choice}`);
 const jobs = await t.run(ctx => ctx.db.query('genJobs').filter(q => q.eq(q.field('mode'), 'edit')).collect());
 expect(jobs).toHaveLength(1);
 expect(jobs[0]).toMatchObject({ parentJobId: source, rootJobId: source, aspect: '1:1', sourceStorageKey: 'videos/source/lease-clean.mp4', sourceCaptionStorageKey: 'captions/source/lease.json', captionStyle: style, retainedMusic: music, telegramChatId: '123' });
 expect(jobs[0].music).toBeUndefined();
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.captionStyle).toBe('meme');
});

test('caption replies reject missing, mismatched and foreign archives without spending', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const source = await delivered(t);
 await replyEdit(t, 2, 100, 'captions none');
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/foreign/lease.json' }));
 await replyEdit(t, 3, 100, 'captions bold');
 await t.run(ctx => ctx.db.patch(source, { captionStorageKey: 'captions/source/lease.json', userId: 'u2' }));
 await replyEdit(t, 4, 100, 'captions pop');
 expect((await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.mode === 'edit')).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('caption replies reject mixed edits and exhausted allowance', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const source = await delivered(t);
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 await replyEdit(t, 2, 100, 'captions bold and make it square');
 const user = await t.run(ctx => ctx.db.query('users').first());
 expect(user?.freeUsed).toBe(0);
 await t.run(ctx => ctx.db.patch(user!._id, { freeUsed: 3, credits: 0 }));
 await replyEdit(t, 3, 100, 'captions clean');
 expect((await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.mode === 'edit')).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.get(user!._id)))?.credits).toBe(0);
});

test('caption instruction without a reply and full personal queue do not spend', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, 'captions bold');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 const source = await delivered(t);
 await t.run(async ctx => {
  await ctx.db.patch(source, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' });
  for (let i = 0; i < 3; i++) await ctx.db.insert('genJobs', { userId: 'u1', mode: 'generate', prompt: 'Existing queued job', status: 'queued', createdAt: Date.now() });
 });
 await replyEdit(t, 3, 100, 'captions clean');
 expect((await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.mode === 'edit')).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('link setup uses this deployment bot and fails closed when configuration is missing', async () => {
 const { t, link } = await setup();
 const actor = t.withIdentity({ subject: 'u1' });
 expect(link.botUsername).toBe('Takeone_test_bot');
 expect(await actor.query(ref<'query'>('telegram:status'), {})).toMatchObject({ configured: true, linked: false, botUsername: 'Takeone_test_bot' });
 await receive(t, 1, `/link ${link.code}`);
 expect(await actor.query(ref<'query'>('telegram:status'), {})).toMatchObject({ linked: true });
 const saved = await t.run(ctx => ctx.db.query('telegramLinks').first());
 vi.stubEnv('TELEGRAM_BOT_USERNAME', '');
 await expect(actor.mutation(ref<'mutation'>('telegram:createLink'), {})).rejects.toThrow('TELEGRAM_UNCONFIGURED');
 expect(await t.run(ctx => ctx.db.query('telegramLinks').first())).toEqual(saved);
 expect(await actor.query(ref<'query'>('telegram:status'), {})).toMatchObject({ linked: true, configured: false });
 expect(await t.query(ref<'query'>('telegram:status'), {})).toBeNull();
});

test('staging bot onboarding and purchase messages use the staging app origin', async () => {
 const { t, link } = await setup();
 vi.stubEnv('APP_URL', 'https://staging.takeone.test/some-path');
 await receive(t, 1, '/help');
 expect((await t.run(ctx => ctx.db.query('telegramMessages').collect())).some(message => message.text.includes('https://staging.takeone.test/create'))).toBe(true);
 await receive(t, 2, `/link ${link.code}`);
 await t.run(async ctx => { const user = await ctx.db.query('users').first(); await ctx.db.patch(user!._id, { freeUsed: 3, credits: 0 }); });
 await receive(t, 3, 'A video about space');
 expect((await t.run(ctx => ctx.db.query('telegramMessages').collect())).some(message => message.text.includes('https://staging.takeone.test/pricing'))).toBe(true);
});

test('Telegram jobs and cancellation reuse web ownership and refund once', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 await receive(t, 2, 'A video about space');
 const job = await t.run(ctx => ctx.db.query('genJobs').first());
 await receive(t, 3, '/jobs');
 expect((await t.run(ctx => ctx.db.query('telegramMessages').collect())).some(m => m.text.includes(`${job!._id} — queued`))).toBe(true);
 await receive(t, 4, `/cancel ${job!._id}`); await receive(t, 4, `/cancel ${job!._id}`); await receive(t, 5, `/cancel ${job!._id}`);
 expect((await t.run(ctx => ctx.db.get(job!._id)))?.status).toBe('cancelled');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('Telegram cannot list or cancel another account video or cancel a running render', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const foreign = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'other', mode: 'generate', prompt: 'Private other account prompt', status: 'queued', createdAt: Date.now() }));
 await receive(t, 2, '/jobs'); await receive(t, 3, `/cancel ${foreign}`); await receive(t, 4, '/cancel invalid');
 expect((await t.run(ctx => ctx.db.query('telegramMessages').collect())).every(m => !m.text.includes('Private other account prompt'))).toBe(true);
 expect((await t.run(ctx => ctx.db.get(foreign)))?.status).toBe('queued');
 await receive(t, 5, 'A video about space');
 const own = await t.run(ctx => ctx.db.query('genJobs').filter(q => q.eq(q.field('userId'), 'u1')).first());
 await t.run(ctx => ctx.db.patch(own!._id, { status: 'processing' }));
 await receive(t, 6, `/cancel ${own!._id}`);
 expect((await t.run(ctx => ctx.db.get(own!._id)))?.status).toBe('processing');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});

test('manual delivery retry keeps attempts monotonic and never charges or renders', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'u1', mode: 'generate', prompt: 'Finished video', status: 'done', storageKey: 'videos/source/lease.mp4', createdAt: Date.now(), telegramChatId: '123', telegramDeliveryStatus: 'failed', telegramDeliveryAttempt: 3 }));
 const actor = t.withIdentity({ subject: 'u1' });
 await actor.mutation(ref<'mutation'>('telegramDelivery:retry'), { jobId }); await actor.mutation(ref<'mutation'>('telegramDelivery:retry'), { jobId });
 const delivery = await t.mutation(ref<'mutation'>('telegramDelivery:claim'), { jobId });
 expect(delivery.attempt).toBe(4);
 await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt: 3, success: true });
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveryStatus).toBe('sending');
 await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt: 4, success: false });
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveryStatus).toBe('pending');
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveryLimit).toBe(6);
 for (const attempt of [5, 6]) {
  expect((await t.mutation(ref<'mutation'>('telegramDelivery:claim'), { jobId })).attempt).toBe(attempt);
  await t.mutation(ref<'mutation'>('telegramDelivery:finish'), { jobId, attempt, success: false });
 }
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveryStatus).toBe('failed');
 await expect(actor.mutation(ref<'mutation'>('telegramDelivery:retry'), { jobId })).rejects.toThrow('DELIVERY_RETRY_TOO_SOON');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(1);
});

test('delivery rechecks linked ownership when queued work starts', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'u1', mode: 'generate', prompt: 'Finished video', status: 'done', storageKey: 'videos/source/lease.mp4', createdAt: Date.now(), telegramChatId: '123', telegramDeliveryStatus: 'failed', telegramDeliveryAttempt: 3 }));
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'other', credits: 0, freeUsed: 0 }));
 await expect(t.withIdentity({ subject: 'other' }).mutation(ref<'mutation'>('telegramDelivery:retry'), { jobId })).rejects.toThrow('DELIVERY_UNAVAILABLE');
 const actor = t.withIdentity({ subject: 'u1' });
 await actor.mutation(ref<'mutation'>('telegramDelivery:retry'), { jobId });
 await actor.mutation(ref<'mutation'>('telegram:unlink'), {});
 expect(await t.mutation(ref<'mutation'>('telegramDelivery:claim'), { jobId })).toBeNull();
 expect((await t.run(ctx => ctx.db.get(jobId)))?.telegramDeliveryStatus).toBe('failed');
 await expect(actor.mutation(ref<'mutation'>('telegramDelivery:retry'), { jobId })).rejects.toThrow('TELEGRAM_LINK_CHANGED');
});

test('Telegram lists and uses only its linked owners uploaded audio', async () => {
 const { t, link } = await setup();
 await receive(t, 1, `/link ${link.code}`);
 const storageId = await t.run(ctx => ctx.storage.store(new Blob(['test audio'])));
 const own = await t.run(ctx => ctx.db.insert('uploads', { userId: 'u1', kind: 'audio', confirmedOwnership: true, name: 'Owner beat', size: 10, contentType: 'audio/mpeg', status: 'ready', storageId, createdAt: Date.now() }));
 const foreign = await t.run(ctx => ctx.db.insert('uploads', { userId: 'u2', kind: 'audio', confirmedOwnership: true, name: 'Foreign beat', size: 10, contentType: 'audio/mpeg', status: 'ready', storageId, createdAt: Date.now() }));
 await receive(t, 2, '/music');
 const messages = await t.run(ctx => ctx.db.query('telegramMessages').collect());
 expect(messages.map(m => m.text).join('\n')).toContain('Owner beat');
 expect(messages.map(m => m.text).join('\n')).not.toContain('Foreign beat');
 await receive(t, 3, `/music upload:${foreign} 20`);
 expect((await t.run(ctx => ctx.db.query('telegramLinks').first()))?.music).toBeUndefined();
 await receive(t, 4, `/music upload:${own} 20`);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 await receive(t, 5, 'Make a reel about cooking');
 expect((await t.run(ctx => ctx.db.query('genJobs').first()))?.music).toMatchObject({ trackId: `upload:${own}`, storageId, volume: 0.2 });
});

test.each(['sans', 'serif', 'mono'])('caption reply accepts the bundled %s font', async font => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const source = await delivered(t);
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 await replyEdit(t, 2, 100, `captions clean ${font}`);
 const edits = (await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.mode === 'edit');
 expect(edits).toHaveLength(1); expect(edits[0].captionFont).toBe(font);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
test('caption replies reject unknown fonts without spending and inherit saved fonts', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const source = await delivered(t);
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json', captionFont: 'serif' }));
 await replyEdit(t, 2, 100, 'captions clean unknown');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 await replyEdit(t, 3, 100, 'captions pop');
 const edits = (await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.mode === 'edit');
 expect(edits).toHaveLength(1); expect(edits[0].captionFont).toBe('serif');
});

test('ordinary reply edits retain the caption archive and its saved styling', async () => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 const source = await delivered(t);
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json', captionStyle: 'meme', captionFont: 'mono', captionPosition: 'middle' }));
 await replyEdit(t, 2, 100, 'trim 00:01 to 00:04');
 const edits = (await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.mode === 'edit');
 expect(edits).toHaveLength(1);
 expect(edits[0]).toMatchObject({ captionTransform: true, sourceStorageKey: 'videos/source/lease-clean.mp4', sourceCaptionStorageKey: 'captions/source/lease.json', captionStyle: 'meme', captionFont: 'mono', captionPosition: 'middle' });
});

test.each(['STOCK_VIDEO_ENABLED', 'MANAGED_RENDERING_PAUSED'])('%s unavailability replies once without a job or debit and never submits on replay', async flag => {
 const { t, link } = await setup(); await receive(t, 1, `/link ${link.code}`);
 vi.stubEnv(flag, flag === 'MANAGED_RENDERING_PAUSED' ? 'true' : 'false');
 await receive(t, 2, 'A reel about mountains');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 const replies = await t.run(ctx => ctx.db.query('telegramMessages').collect());
 expect(replies.some(row => row.text?.includes('No allowance was used.'))).toBe(true);
 vi.stubEnv(flag, flag === 'MANAGED_RENDERING_PAUSED' ? 'false' : 'true'); await receive(t, 2, 'A reel about mountains');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 expect(await t.run(ctx => ctx.db.query('telegramMessages').collect())).toHaveLength(replies.length);
 await receive(t, 3, 'A reel about mountains');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(1);
});
