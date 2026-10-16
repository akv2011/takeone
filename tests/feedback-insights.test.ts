import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(2_000_000);
  vi.stubEnv('DISPATCH_URL', 'https://worker.test'); vi.stubEnv('DISPATCH_SECRET', 'private-dispatch');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const reply = (body: any) => ({ sentiment: 'mixed', why: 'Strong hook, slow ending', themes: ['Hook', 'Ending'], notes: body.notes.map((note: any, index: number) => ({ id: note.id, sentiment: index % 2 ? 'negative' : 'positive' })) });
function stubDispatcher(respond: (body: any) => Response | Promise<Response> = body => new Response(JSON.stringify(reply(body)))) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => respond(JSON.parse(init.body as string)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
async function setup(notesPerLink = [2, 2]) {
  const t = convexTest(schema, modules), owner = t.withIdentity({ subject: 'owner' }), other = t.withIdentity({ subject: 'other' });
  const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'private prompt', status: 'done', createdAt: Date.now() }));
  await t.run(ctx => ctx.db.patch(jobId, { storageKey: `videos/${jobId}/worker-1.mp4`, leaseToken: 'worker-1' }));
  const links: Array<{ id: string; token: string }> = [], ids: string[] = [];
  for (const [link, count] of notesPerLink.entries()) {
    links.push(await owner.action(ref<'action'>('reviews:create'), { jobId, durationSec: 10, days: 1 }));
    for (let n = 0; n < count; n++) ids.push(await t.mutation(ref<'mutation'>('reviews:addComment'), { token: links[link].token, name: `Reviewer ${link}`, text: `Note ${link}-${n}`, at: link + n / 10, requestId: `request-${link}-${n}` }));
    vi.advanceTimersByTime(1000);
  }
  const summarize = (who: { action: typeof t.action } = owner) => who.action(ref<'action'>('reviews:summarize'), { jobId });
  const summary = (who: { query: typeof t.query } = owner) => who.query(ref<'query'>('reviews:summary'), { jobId });
  return { t, owner, other, jobId, links, ids, summarize, summary };
}
test('only the owner can summarize or read the summary', async () => {
  const { t, other, summarize, summary } = await setup();
  const fetchMock = stubDispatcher();
  await expect(summarize(other)).rejects.toThrow('REVIEW_UNAVAILABLE');
  await expect(summarize(t)).rejects.toThrow('UNAUTHENTICATED');
  expect(fetchMock).not.toHaveBeenCalled();
  await summarize();
  expect(await summary()).not.toBeNull();
  expect(await summary(other)).toBeNull();
  expect(await summary(t)).toBeNull();
});
test('fewer than 3 notes fails before the dispatcher and spends no quota', async () => {
  const { t, summarize } = await setup([2]);
  const fetchMock = stubDispatcher();
  await expect(summarize()).rejects.toThrow('SUMMARY_NEEDS_NOTES');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run(ctx => ctx.db.query('feedbackSummaries').collect())).toEqual([]);
});
test('sends only ids, times and text from every link of the version and stores the joined result', async () => {
  const { jobId, ids, summarize, summary } = await setup();
  const fetchMock = stubDispatcher(), timeout = vi.spyOn(AbortSignal, 'timeout');
  await summarize();
  expect(fetchMock).toHaveBeenCalledWith('https://worker.test/summarize-feedback', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer private-dispatch' }) }));
  expect(timeout).toHaveBeenCalledWith(30_000);
  const body = fetchMock.mock.calls[0][1].body as string;
  expect(JSON.parse(body)).toEqual({ versionId: jobId, notes: [
    { id: ids[2], at: 1, text: 'Note 1-0' }, { id: ids[3], at: 1.1, text: 'Note 1-1' }, { id: ids[0], at: 0, text: 'Note 0-0' }, { id: ids[1], at: 0.1, text: 'Note 0-1' },
  ] });
  expect(body).not.toMatch(/Reviewer|private prompt/);
  expect(await summary()).toEqual({ sentiment: 'mixed', why: 'Strong hook, slow ending', themes: ['Hook', 'Ending'], noteCount: 4, createdAt: Date.now(), notes: [
    { id: ids[2], at: 1, sentiment: 'positive' }, { id: ids[3], at: 1.1, sentiment: 'negative' }, { id: ids[0], at: 0, sentiment: 'positive' }, { id: ids[1], at: 0.1, sentiment: 'negative' },
  ] });
});
test('the 4th summary in an hour fails before the dispatcher and the window reopens after an hour', async () => {
  const { summarize } = await setup();
  const fetchMock = stubDispatcher();
  for (let i = 0; i < 3; i++) await summarize();
  await expect(summarize()).rejects.toThrow('SUMMARY_RATE_LIMIT');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(3_600_000);
  await summarize();
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
test.each([
  ['an unknown note id', (body: any, stray: string) => new Response(JSON.stringify({ ...reply(body), notes: reply(body).notes.map((note: any, index: number) => index ? note : { ...note, id: stray }) }))],
  ['a repeated note id', (body: any) => new Response(JSON.stringify({ ...reply(body), notes: reply(body).notes.map((note: any) => ({ ...note, id: body.notes[0].id })) }))],
  ['a missing note', (body: any) => new Response(JSON.stringify({ ...reply(body), notes: reply(body).notes.slice(1) }))],
  ['a 4th theme', (body: any) => new Response(JSON.stringify({ ...reply(body), themes: ['One', 'Two', 'Three', 'Four'] }))],
  ['a bad sentiment', (body: any) => new Response(JSON.stringify({ ...reply(body), sentiment: 'angry' }))],
  ['a non-OK status', () => new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 502 })],
])('a dispatcher reply with %s stores nothing', async (_name, respond) => {
  const { t, summarize, summary } = await setup();
  const stray = await t.run(async ctx => {
    const jobId = await ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'other version', status: 'done', createdAt: 1 });
    const reviewId = await ctx.db.insert('reviewLinks', { userId: 'owner', jobId, tokenHash: 'b'.repeat(64), storageKey: `videos/${jobId}/other.mp4`, createdAt: 1, expiresAt: 1, durationSec: 10, commentCount: 1 });
    return ctx.db.insert('reviewComments', { reviewId, requestId: 'stray-note', name: 'Other', text: 'Other version', at: 1, createdAt: 1, resolved: false });
  });
  stubDispatcher(body => respond(body, stray));
  await expect(summarize()).rejects.toThrow();
  expect(await summary()).toBeNull();
});
test('a note deleted while Gemini reads fails as stale and stores nothing', async () => {
  const { t, ids, summarize, summary } = await setup();
  stubDispatcher(async body => { await t.run(ctx => ctx.db.delete(ids[0] as any)); return new Response(JSON.stringify(reply(body))); });
  await expect(summarize()).rejects.toThrow('SUMMARY_STALE');
  expect(await summary()).toBeNull();
});
test('removing a link clears the summary only when the summary used its notes', async () => {
  const { jobId, owner, links, summarize, summary } = await setup();
  stubDispatcher();
  await summarize();
  const empty = await owner.action(ref<'action'>('reviews:create'), { jobId, durationSec: 10, days: 1 });
  await owner.mutation(ref<'mutation'>('reviews:revoke'), { reviewId: empty.id });
  await owner.mutation(ref<'mutation'>('reviews:remove'), { reviewId: empty.id });
  expect(await summary()).not.toBeNull();
  await owner.mutation(ref<'mutation'>('reviews:remove'), { reviewId: links[0].id });
  expect(await summary()).toBeNull();
});
