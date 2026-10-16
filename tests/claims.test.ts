import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import type { ClaimsCheck } from '../convex/claims';
const modules = import.meta.glob('../convex/**/*.ts');
const outputMetadata = { mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true };
const source = (id: string) => ({ url: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${id}`, title: `${id}.example` });
const checked = (): Extract<ClaimsCheck, { status: 'checked' }> => ({ status: 'checked', claims: [
  { text: 'The Eiffel Tower is 330 metres tall.', verdict: 'supported', reason: 'The operator lists 330 m.', sources: [source('a'), source('b')], searches: ['eiffel tower height'] },
  { text: 'Water boils at 50 C at sea level.', verdict: 'disputed', reason: 'Sources put it at 100 C.', sources: [], searches: [] },
] });
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('WORKER_SECRET', 'claims-secret'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
  const t = convexTest(schema, modules);
  const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Tower facts', status: 'dispatched', attempts: 1, createdAt: Date.now(), leaseExpiresAt: Date.now() + 60_000 }));
  const call = (name: string, args: object) => t.mutation(ref<'mutation'>(`generate:${name}`), { workerSecret: 'claims-secret', ...args });
  const { leaseToken } = await call('claimJob', { jobId, workerId: 'claims-worker' });
  const complete = (extra: object, token = leaseToken) => call('completeJob', { ...outputMetadata, jobId, leaseToken: token, storageKey: `videos/${jobId}/${token}.mp4`, ...extra });
  const getJob = (subject: string) => t.withIdentity({ subject }).query(ref<'query'>('generate:getJob'), { jobId });
  return { t, jobId, leaseToken, complete, getJob };
}

test('the completing lease stores claims and the cover key, and only the owner reads the claims', async () => {
  const { t, jobId, leaseToken, complete, getJob } = await setup();
  expect(await complete({ claims: checked(), coverStorageKey: `videos/${jobId}/${leaseToken}-cover.png` })).toBe(true);
  expect(await getJob('owner')).toMatchObject({ status: 'done', hasCover: true, claims: checked() });
  expect(await getJob('intruder')).toBeNull();
  const page = await t.withIdentity({ subject: 'owner' }).query(ref<'query'>('generate:listJobs'), { accountKey: 'owner', paginationOpts: { numItems: 10, cursor: null } });
  expect(page.page[0]).toMatchObject({ hasCover: true });
  expect(page.page[0]).not.toHaveProperty('claims');
  expect(page.page[0]).not.toHaveProperty('coverStorageKey');
});

test('a stale lease cannot write claims or a cover', async () => {
  const { t, jobId, complete, getJob } = await setup();
  expect(await complete({ claims: checked(), coverStorageKey: `videos/${jobId}/stale-cover.png` }, 'stale')).toBe(false);
  const job = await t.run(ctx => ctx.db.get(jobId));
  expect(job).toMatchObject({ status: 'processing' });
  expect(job).not.toHaveProperty('claims');
  expect(job).not.toHaveProperty('coverStorageKey');
  expect(await complete({})).toBe(true);
  expect(await getJob('owner')).toMatchObject({ status: 'done', hasCover: false, claims: null });
});

test.each([
  ['six claims', { ...checked(), claims: [...checked().claims, ...checked().claims, ...checked().claims].slice(0, 6) }],
  ['a javascript link', { status: 'checked', claims: [{ ...checked().claims[0], sources: [{ url: 'javascript:alert(1)', title: 'x' }] }] }],
  ['a plain http link', { status: 'checked', claims: [{ ...checked().claims[0], sources: [{ url: 'http://example.com', title: 'x' }] }] }],
  ['four sources', { status: 'checked', claims: [{ ...checked().claims[0], sources: [source('a'), source('b'), source('c'), source('d')] }] }],
  ['an empty reason', { status: 'checked', claims: [{ ...checked().claims[0], reason: '  ' }] }],
  ['an overlong claim', { status: 'checked', claims: [{ ...checked().claims[0], text: 'x'.repeat(501) }] }],
])('%s is stored as unavailable and the render still completes', async (_name, claims) => {
  const { complete, getJob } = await setup();
  expect(await complete({ claims })).toBe(true);
  expect(await getJob('owner')).toMatchObject({ status: 'done', claims: { status: 'unavailable' } });
});

test('a cover key outside this attempt is dropped without failing the render', async () => {
  const { t, jobId, complete, getJob } = await setup();
  expect(await complete({ claims: { status: 'unavailable' }, coverStorageKey: `videos/other-job/lease-cover.png` })).toBe(true);
  expect(await getJob('owner')).toMatchObject({ status: 'done', hasCover: false, claims: { status: 'unavailable' } });
  expect(await t.run(ctx => ctx.db.get(jobId))).not.toHaveProperty('coverStorageKey');
});

test.each([
  ['a verdict outside the three labels', { status: 'checked', claims: [{ ...checked().claims[0], verdict: 'true' }] }],
  ['an extra field', { status: 'checked', claims: [{ ...checked().claims[0], score: 0.9 }] }],
  ['a missing field', { status: 'checked', claims: [{ text: 'x', verdict: 'supported', reason: 'y', sources: [] }] }],
  ['an unknown status', { status: 'pending' }],
  ['a string', 'checked'],
])('shape drift (%s) is stored as unavailable instead of failing completion', async (_name, claims) => {
  const { complete, getJob } = await setup();
  expect(await complete({ claims, coverStorageKey: 42 })).toBe(true);
  expect(await getJob('owner')).toMatchObject({ status: 'done', hasCover: false, claims: { status: 'unavailable' } });
});

test('the cover action signs only the owner\'s cover key', async () => {
  const { t, jobId, leaseToken, complete } = await setup();
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ url: 'https://storage.googleapis.com/signed-cover' })));
  vi.stubGlobal('fetch', fetcher);
  const getCover = (subject: string) => t.withIdentity({ subject }).action(ref<'action'>('generate:getCover'), { jobId });
  await complete({});
  await expect(getCover('owner')).rejects.toThrow('COVER_UNAVAILABLE');
  expect(fetcher).not.toHaveBeenCalled();
  await t.run(ctx => ctx.db.patch(jobId, { coverStorageKey: `videos/${jobId}/${leaseToken}-cover.png` }));
  await expect(getCover('intruder')).rejects.toThrow('COVER_UNAVAILABLE');
  expect(fetcher).not.toHaveBeenCalled();
  expect(await getCover('owner')).toEqual({ url: 'https://storage.googleapis.com/signed-cover' });
  expect(fetcher.mock.calls[0][0]).toBe('https://dispatcher.example/sign-cover');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ storageKey: `videos/${jobId}/${leaseToken}-cover.png` });
});
