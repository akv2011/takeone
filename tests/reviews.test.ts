import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import { tokenHash } from '../convex/reviews';
const modules = import.meta.glob('../convex/**/*.ts');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(2_000_000); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
  const t = convexTest(schema, modules), owner = t.withIdentity({ subject: 'owner' });
  const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'private prompt', status: 'done', createdAt: Date.now() }));
  const storageKey = `videos/${jobId}/worker-1.mp4`;
  await t.run(ctx => ctx.db.patch(jobId, { storageKey, leaseToken: 'worker-1', sourceStorageKey: 'videos/private/source.mp4' }));
  const create = (days = 1) => owner.action(ref<'action'>('reviews:create'), { jobId, durationSec: 10, days });
  const link = await create();
  const get = (token = link.token) => t.query(ref<'query'>('reviews:get'), { token });
  const add = (args = {}) => t.mutation(ref<'mutation'>('reviews:addComment'), { token: link.token, name: 'Reviewer', text: 'Shorten this shot', at: 2.5, requestId: 'comment-0001', ...args });
  return { t, owner, jobId, storageKey, create, link, get, add };
}
test('creates a random hashed capability and exposes only review data to guests and owners', async () => {
  const { t, owner, jobId, link, get } = await setup();
  expect(link.token).toMatch(/^[a-f0-9]{64}$/);
  const stored = await t.run(ctx => ctx.db.get(link.id));
  expect(stored!.tokenHash).toBe(await tokenHash(link.token));
  expect(JSON.stringify(stored)).not.toContain(link.token);
  expect(await get()).toEqual({ durationSec: 10, expiresAt: link.expiresAt, comments: [] });
  const listed = await owner.query(ref<'query'>('reviews:list'), { jobId });
  expect(listed).toEqual([{ id: link.id, createdAt: 2_000_000, expiresAt: link.expiresAt, commentCount: 0 }]);
  expect(JSON.stringify(listed)).not.toMatch(/tokenHash|storageKey|worker-1|private prompt/);
});
test('isolates create, history, feedback, resolve, revoke and delete by owner', async () => {
  const { t, jobId, link, add } = await setup();
  const other = t.withIdentity({ subject: 'other' });
  await expect(other.action(ref<'action'>('reviews:create'), { jobId, durationSec: 10, days: 1 })).rejects.toThrow('VIDEO_UNAVAILABLE');
  await expect(t.action(ref<'action'>('reviews:create'), { jobId, durationSec: 10, days: 1 })).rejects.toThrow('UNAUTHENTICATED');
  expect(await other.query(ref<'query'>('reviews:list'), { jobId })).toEqual([]);
  expect(await other.query(ref<'query'>('reviews:feedback'), { reviewId: link.id })).toBeNull();
  const commentId = await add();
  for (const [name, args] of [['resolve', { commentId, resolved: true }], ['revoke', { reviewId: link.id }], ['remove', { reviewId: link.id }]] as const) {
    await expect(other.mutation(ref<'mutation'>(`reviews:${name}`), args)).rejects.toThrow('REVIEW_UNAVAILABLE');
  }
});
test.each(['', 'a'.repeat(63), 'x'.repeat(64), 'a'.repeat(65), 'a'.repeat(64)])('unknown or malformed token cannot read or comment (%s)', async token => {
  const { get, add } = await setup();
  expect(await get(token)).toBeNull();
  await expect(add({ token })).rejects.toThrow('REVIEW_UNAVAILABLE');
});
test('revocation, expiry and exact version changes close read, comment and signing access', async () => {
  const { t, owner, link, jobId, storageKey, get, add } = await setup();
  await t.run(ctx => ctx.db.patch(jobId, { storageKey: `videos/${jobId}/different.mp4` }));
  expect(await get()).toBeNull();
  await t.run(ctx => ctx.db.patch(jobId, { storageKey }));
  vi.setSystemTime(link.expiresAt);
  expect(await get()).toBeNull();
  await expect(add()).rejects.toThrow('REVIEW_UNAVAILABLE');
  vi.setSystemTime(2_000_000);
  await owner.mutation(ref<'mutation'>('reviews:revoke'), { reviewId: link.id });
  expect(await get()).toBeNull();
  await expect(t.action(ref<'action'>('reviews:playback'), { token: link.token })).rejects.toThrow('REVIEW_UNAVAILABLE');
});
test.each(['processing', 'failed'])('cannot share a %s job', async status => {
  const { t, jobId, create } = await setup();
  await t.run(ctx => ctx.db.patch(jobId, { status }));
  await expect(create()).rejects.toThrow('VIDEO_UNAVAILABLE');
});
test('cannot share captions, source files, another job directory or non-private legacy URL', async () => {
  const { t, jobId, create } = await setup();
  for (const storageKey of ['captions/one/two.json', 'sources/private.mp4', 'videos/another/worker.mp4', undefined]) {
    await t.run(ctx => ctx.db.patch(jobId, { storageKey }));
    await expect(create()).rejects.toThrow('VIDEO_UNAVAILABLE');
  }
});
test('new links revoke the prior capability for that version and creation has a durable quota', async () => {
  const { t, owner, link, create, get } = await setup();
  const second = await create(7);
  expect(second.token).not.toBe(link.token);
  expect(await get()).toBeNull();
  expect(await get(second.token)).not.toBeNull();
  for (let i = 0; i < 3; i++) await create();
  await owner.mutation(ref<'mutation'>('reviews:remove'), { reviewId: link.id });
  await expect(create()).rejects.toThrow('REVIEW_CREATE_LIMIT');
  vi.advanceTimersByTime(3_600_000);
  await expect(create()).resolves.toBeTruthy();
  expect((await t.run(ctx => ctx.db.query('reviewCreators').collect()))).toHaveLength(1);
});
test('comment retries are exact, atomic rate limits cannot be bypassed by request IDs, and owners resolve notes', async () => {
  const { t, owner, link, get, add } = await setup();
  const id = await add(); expect(await add()).toBe(id);
  await expect(add({ text: 'changed' })).rejects.toThrow('COMMENT_RETRY_CHANGED');
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => add({ requestId: `request-${i}` })));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(9);
  expect((await get()).comments).toHaveLength(10);
  vi.advanceTimersByTime(60_000);
  await expect(add({ requestId: 'new-window' })).resolves.toBeTruthy();
  await owner.mutation(ref<'mutation'>('reviews:resolve'), { commentId: id, resolved: true });
  expect((await get()).comments.find((note: any) => note.id === id).resolved).toBe(true);
  await t.run(ctx => ctx.db.patch(link.id, { commentCount: 200 }));
  await expect(add({ requestId: 'overflow-note' })).rejects.toThrow('REVIEW_FULL');
  expect(await add()).toBe(id);
});
test.each([{ name: '' }, { name: 'x'.repeat(61) }, { name: 'bad\nname' }, { text: '' }, { text: 'x'.repeat(1001) }, { text: 'bad\u0000' }, { at: -1 }, { at: 10.001 }, { at: NaN }, { at: Infinity }, { requestId: 'short' }])('rejects malformed feedback %#', async patch => {
  const { add } = await setup(); await expect(add(patch)).rejects.toThrow('INVALID_COMMENT');
});
test('inactive feedback can be deleted by its owner, but an active review must first be revoked', async () => {
  const { t, owner, link, add } = await setup(); await add();
  await expect(owner.mutation(ref<'mutation'>('reviews:remove'), { reviewId: link.id })).rejects.toThrow('REVOKE_FIRST');
  await owner.mutation(ref<'mutation'>('reviews:revoke'), { reviewId: link.id });
  await owner.mutation(ref<'mutation'>('reviews:remove'), { reviewId: link.id });
  expect(await t.run(ctx => ctx.db.query('reviewComments').collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.get(link.id))).toBeNull();
});
test('signs only the frozen output through the private short-TTL route and enforces a global quota', async () => {
  const { t, link, storageKey } = await setup();
  vi.stubEnv('DISPATCH_URL', 'https://worker.test'); vi.stubEnv('DISPATCH_SECRET', 'private-dispatch');
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: 'https://storage.test/video?signature=opaque' })));
  vi.stubGlobal('fetch', fetchMock);
  const play = () => t.action(ref<'action'>('reviews:playback'), { token: link.token });
  expect(await play()).toEqual({ url: 'https://storage.test/video?signature=opaque', expiresAt: Date.now() + 120_000 });
  expect(fetchMock).toHaveBeenCalledWith('https://worker.test/sign-review', expect.objectContaining({ body: JSON.stringify({ storageKey }), headers: expect.objectContaining({ authorization: 'Bearer private-dispatch' }) }));
  for (let i = 1; i < 20; i++) await play();
  await expect(play()).rejects.toThrow('PLAYBACK_RATE_LIMIT');
  expect(fetchMock).toHaveBeenCalledTimes(20);
});
test('a revocation during signing cannot return a new playable URL', async () => {
  const { t, owner, link } = await setup();
  vi.stubEnv('DISPATCH_URL', 'https://worker.test'); vi.stubEnv('DISPATCH_SECRET', 'private-dispatch');
  vi.stubGlobal('fetch', vi.fn(async () => {
    await owner.mutation(ref<'mutation'>('reviews:revoke'), { reviewId: link.id });
    return new Response(JSON.stringify({ url: 'https://storage.test/video' }));
  }));
  await expect(t.action(ref<'action'>('reviews:playback'), { token: link.token })).rejects.toThrow('REVIEW_UNAVAILABLE');
});
