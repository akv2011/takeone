import { convexTest } from 'convex-test';
import { expect, test, beforeEach, afterEach, vi } from 'vitest';
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
test('version history persists branches and failures without spending allowance to read', async () => {
 const t = convexTest(schema, modules);
 const userId = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 20, freeUsed: 0 }));
 const owner = t.withIdentity({ subject: 'owner' });
 const { jobId: original } = await owner.mutation(ref<'mutation'>('generate:requestGeneration'), { mode: 'generate', prompt: 'Space travel video', requestId: 'original-request' });
 await t.run(ctx => ctx.db.patch(original, { status: 'done', storageKey: `videos/${original}/token.mp4` }));
 const edit = (sourceJobId: string, requestId: string) => owner.mutation(ref<'mutation'>('generate:requestEdit'), { sourceJobId, requestId, instruction: 'Speed it up 1.5x' });
 const { jobId: first } = await edit(original, 'first-edit-request');
 await t.run(ctx => ctx.db.patch(first, { status: 'done', storageKey: `videos/${first}/token.mp4` }));
 const { jobId: second } = await edit(first, 'second-edit-request');
 await t.run(ctx => ctx.db.patch(second, { status: 'failed' }));
 const { jobId: branch } = await edit(original, 'branch-edit-request');
 const balance = await t.run(ctx => ctx.db.get(userId));
 const history = await owner.query(ref<'query'>('generate:versions'), { jobId: second });
 expect(history).toHaveLength(4);
 expect(history.find((j: any) => j._id === original)).toMatchObject({ original: true });
 expect(history.find((j: any) => j._id === second)).toMatchObject({ parentJobId: first, status: 'failed' });
 expect(history.find((j: any) => j._id === branch)).toMatchObject({ parentJobId: original });
 expect(await owner.query(ref<'query'>('generate:versions'), { jobId: original })).toEqual(history);
 expect(await t.run(ctx => ctx.db.get(userId))).toEqual(balance);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'other', credits: 1, freeUsed: 0 }));
 expect(await t.withIdentity({ subject: 'other' }).query(ref<'query'>('generate:versions'), { jobId: second })).toEqual([]);
 await expect(t.withIdentity({ subject: 'other' }).mutation(ref<'mutation'>('generate:requestEdit'), { sourceJobId: original, instruction: 'Speed it up 1.5x', requestId: 'foreign-request' })).rejects.toThrow('SOURCE_UNAVAILABLE');
});

test('malformed Studio links return unavailable without requiring a provisioned user row', async () => {
 const t = convexTest(schema, modules);
 const actor = t.withIdentity({ subject: 'new-account' });
 for (const jobId of ['not-a-job', '', '../other-account']) {
  expect(await actor.query(ref<'query'>('generate:getJob'), { jobId })).toBeNull();
  expect(await actor.query(ref<'query'>('generate:versions'), { jobId })).toEqual([]);
 }
 const otherTableId = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'another', credits: 0, freeUsed: 0 }));
 expect(await actor.query(ref<'query'>('generate:getJob'), { jobId: otherTableId })).toBeNull();
 await expect(t.query(ref<'query'>('generate:getJob'), { jobId: 'not-a-job' })).rejects.toThrow('UNAUTHENTICATED');
});

test('caption restyling requires an owned archive and preserves ancestry without a second debit', async () => {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 2, freeUsed: 0 }));
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'other', credits: 2, freeUsed: 0 }));
 const owner = t.withIdentity({ subject: 'owner' });
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'A source', status: 'done', createdAt: Date.now(), aspect: '1:1', storageKey: 'videos/source/lease.mp4' }));
 const soundtrack = { trackId: 'licensed', label: 'Licensed track', storageKey: 'music/track.mp3', attribution: 'Test artist', volume: 0.2, duck: true };
 await t.run(ctx => ctx.db.patch(source, { music: soundtrack }));
 const args = { sourceJobId: source, requestId: 'caption-edit-1', captionStyle: 'clean' };
 await expect(owner.mutation(ref<'mutation'>('generate:requestCaptionEdit'), args)).rejects.toThrow('CAPTION_SOURCE_UNAVAILABLE');
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 await expect(t.withIdentity({ subject: 'other' }).mutation(ref<'mutation'>('generate:requestCaptionEdit'), args)).rejects.toThrow('CAPTION_SOURCE_UNAVAILABLE');
 const first = await owner.mutation(ref<'mutation'>('generate:requestCaptionEdit'), args);
 expect(await owner.mutation(ref<'mutation'>('generate:requestCaptionEdit'), args)).toEqual(first);
 expect(await t.run(ctx => ctx.db.get(first.jobId))).toMatchObject({ parentJobId: source, rootJobId: source, aspect: '1:1', sourceStorageKey: 'videos/source/lease-clean.mp4', sourceCaptionStorageKey: 'captions/source/lease.json', captionStyle: 'clean', retainedMusic: soundtrack });
 expect((await t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique()))?.freeUsed).toBe(1);
 await t.run(ctx => ctx.db.patch(first.jobId, { status: 'done', cleanStorageKey: `videos/${first.jobId}/second-clean.mp4`, captionStorageKey: `captions/${first.jobId}/second.json` }));
 const second = await owner.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { sourceJobId: first.jobId, requestId: 'caption-edit-2', captionStyle: 'none' });
 expect(await t.run(ctx => ctx.db.get(second.jobId))).toMatchObject({ parentJobId: first.jobId, rootJobId: source, retainedMusic: soundtrack, sourceStorageKey: `videos/${first.jobId}/second-clean.mp4`, captionStyle: 'none' });
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: 'videos/foreign/lease-clean.mp4' }));
 await expect(owner.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { ...args, requestId: 'invalid-pair' })).rejects.toThrow('CAPTION_SOURCE_UNAVAILABLE');
 expect((await t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'owner')).unique()))?.freeUsed).toBe(2);
});

test('caption wording validates before debit and survives the worker claim', async () => {
 const t = convexTest(schema, modules);
 const userId = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 0, freeUsed: 0 }));
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Caption source', status: 'done', createdAt: Date.now(), cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 const actor = t.withIdentity({ subject: 'owner' });
 for (const texts of [[], [''], ['x'.repeat(4001)], Array(10001).fill('x')]) await expect(actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { sourceJobId: source, captionStyle: 'clean', requestId: 'invalid-text', captionTexts: texts })).rejects.toThrow('INVALID_CAPTION_TEXT');
 expect((await t.run(ctx => ctx.db.get(userId)))?.freeUsed).toBe(0);
 const result = await actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { sourceJobId: source, captionStyle: 'clean', requestId: 'corrected-text', captionTexts: ['Corrected wording'] });
 expect((await t.run(ctx => ctx.db.get(result.jobId)))?.captionTexts).toEqual(['Corrected wording']);
 vi.stubEnv('WORKER_SECRET', 'test-secret');
 try {
  await t.run(ctx => ctx.db.patch(result.jobId, { status: 'dispatched', leaseExpiresAt: Date.now() + 60000, attempts: 1 }));
  expect(await actor.mutation(ref<'mutation'>('generate:claimJob'), { jobId: result.jobId, workerId: 'worker-123', workerSecret: 'test-secret' })).toMatchObject({ captionTexts: ['Corrected wording'] });
 } finally { vi.unstubAllEnvs(); }
});

test('caption reads enforce ownership and bound private metadata', async () => {
 const t = convexTest(schema, modules);
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Caption source', status: 'done', createdAt: Date.now(), cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 vi.stubEnv('DISPATCH_URL', 'https://dispatcher.test'); vi.stubEnv('DISPATCH_SECRET', 'secret');
 const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
 try {
  await expect(t.withIdentity({ subject: 'other' }).action(ref<'action'>('generate:getCaptionCues'), { jobId: source })).rejects.toThrow('CAPTION_SOURCE_UNAVAILABLE');
  expect(fetcher).not.toHaveBeenCalled();
  const cues = [{ start: 0, end: 1, text: 'Original words' }];
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://storage.googleapis.com/bucket/captions/source/lease.json' }))).mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, style: 'clean', cues })));
  expect(await t.withIdentity({ subject: 'owner' }).action(ref<'action'>('generate:getCaptionCues'), { jobId: source })).toEqual(cues);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ storageKey: 'captions/source/lease.json' });
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://storage.googleapis.com/bucket/captions/source/lease.json' }))).mockResolvedValueOnce(new Response('x'.repeat(512 * 1024 + 1)));
  await expect(t.withIdentity({ subject: 'owner' }).action(ref<'action'>('generate:getCaptionCues'), { jobId: source })).rejects.toThrow('Caption archive too large');
 } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});

test('caption corrections cannot share a request ID with different wording', async () => {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 0, freeUsed: 0 }));
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Caption source', status: 'done', createdAt: Date.now(), cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 const actor = t.withIdentity({ subject: 'owner' });
 const args = { sourceJobId: source, captionStyle: 'clean', requestId: 'caption-retry-id', captionTexts: ['First correction'] };
 const first = await actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), args);
 await expect(actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { ...args, captionTexts: ['Different correction'] })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 expect(await actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), args)).toEqual(first);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});

test('caption position persists across versions and is part of request identity', async () => {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 0, freeUsed: 0 }));
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Caption source', status: 'done', createdAt: Date.now(), cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 const actor = t.withIdentity({ subject: 'owner' });
 const args = { sourceJobId: source, captionStyle: 'clean', requestId: 'position-request', captionPosition: 'middle' };
 const first = await actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), args);
 expect((await t.run(ctx => ctx.db.get(first.jobId)))?.captionPosition).toBe('middle');
 await expect(actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { ...args, captionPosition: 'top' })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 await t.run(ctx => ctx.db.patch(first.jobId, { status: 'done', cleanStorageKey: 'videos/next/lease-clean.mp4', captionStorageKey: 'captions/next/lease.json' }));
 const next = await actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { sourceJobId: first.jobId, captionStyle: 'meme', requestId: 'position-next' });
 expect((await t.run(ctx => ctx.db.get(next.jobId)))?.captionPosition).toBe('middle');
});

test('paginated version history reaches all edits beyond fifty without leaking private fields or foreign rows', async () => {
 const t = convexTest(schema, modules), actor = t.withIdentity({ subject: 'owner' });
 const root = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Original video', status: 'done', createdAt: 1 }));
 let selected = root;
 for (let i = 0; i < 65; i++) selected = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'edit', prompt: `Edit ${i}`, status: 'done', rootJobId: root, parentJobId: root, createdAt: i + 2, captionTexts: ['private transcript'], leaseToken: 'private-lease' }));
 await t.run(ctx => ctx.db.insert('genJobs', { userId: 'other', mode: 'edit', prompt: 'Foreign edit', status: 'done', rootJobId: root, createdAt: 200 }));
 const original = await actor.query(ref<'query'>('generate:versions'), { jobId: selected, rootOnly: true, accountKey: 'owner' });
 expect(original).toEqual([expect.objectContaining({ _id: root, original: true })]);
 const ids: string[] = []; let cursor: string | null = null;
 for (let page = 0; page < 5; page++) {
  const result: any = await actor.query(ref<'query'>('generate:listVersions'), { jobId: selected, accountKey: 'owner', paginationOpts: { numItems: 20, cursor } });
  expect(result.page.length).toBeLessThanOrEqual(20);
  for (const entry of result.page) {
   expect(entry.original).toBe(false); expect(entry).not.toHaveProperty('leaseToken'); expect(entry).not.toHaveProperty('captionTexts');
   expect(entry.prompt).not.toBe('Foreign edit'); ids.push(entry._id);
  }
  if (result.isDone) break;
  cursor = result.continueCursor;
 }
 expect(ids).toHaveLength(65); expect(new Set(ids).size).toBe(65); expect(ids).not.toContain(root);
 expect(await t.run(ctx => ctx.db.query('users').collect())).toEqual([]); // History needs no provisioning or credit mutation.
});
test('version pages enforce account key, selected/root ownership and page bounds', async () => {
 const t = convexTest(schema, modules), actor = t.withIdentity({ subject: 'owner' });
 const foreignRoot = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'other', mode: 'generate', prompt: 'Foreign original', status: 'done', createdAt: 1 }));
 const broken = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'edit', prompt: 'Cross owner root', status: 'done', rootJobId: foreignRoot, createdAt: 2 }));
 const owned = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'My original', status: 'done', createdAt: 3 }));
 const request = { jobId: owned, accountKey: 'owner', paginationOpts: { numItems: 20, cursor: null } };
 for (const jobId of [foreignRoot, broken, 'malformed']) {
  expect((await actor.query(ref<'query'>('generate:listVersions'), { ...request, jobId })).page).toEqual([]);
  expect(await actor.query(ref<'query'>('generate:versions'), { jobId, rootOnly: true, accountKey: 'owner' })).toEqual([]);
 }
 expect((await actor.query(ref<'query'>('generate:listVersions'), { ...request, accountKey: 'other' })).page).toEqual([]);
 expect(await actor.query(ref<'query'>('generate:versions'), { jobId: owned, rootOnly: true, accountKey: 'other' })).toEqual([]);
 for (const numItems of [0, 51, 1.5]) await expect(actor.query(ref<'query'>('generate:listVersions'), { ...request, paginationOpts: { numItems, cursor: null } })).rejects.toThrow('INVALID_PAGE_SIZE');
 await expect(t.query(ref<'query'>('generate:listVersions'), request)).rejects.toThrow('UNAUTHENTICATED');
});

test('caption font persists across versions and is part of request identity', async () => {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 0, freeUsed: 0 }));
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Caption source', status: 'done', createdAt: Date.now(), cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 const actor = t.withIdentity({ subject: 'owner' });
 const args = { sourceJobId: source, captionStyle: 'clean', requestId: 'font-request', captionFont: 'serif' };
 const first = await actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), args);
 expect((await t.run(ctx => ctx.db.get(first.jobId)))?.captionFont).toBe('serif');
 await expect(actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { ...args, captionFont: 'mono' })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 await t.run(ctx => ctx.db.patch(first.jobId, { status: 'done', cleanStorageKey: 'videos/next/lease-clean.mp4', captionStorageKey: 'captions/next/lease.json' }));
 const next = await actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { sourceJobId: first.jobId, captionStyle: 'meme', requestId: 'font-next' });
 expect((await t.run(ctx => ctx.db.get(next.jobId)))?.captionFont).toBe('serif');
});

test('invalid caption fonts do not debit and valid fonts reach the worker', async () => {
 const t = convexTest(schema, modules);
 const user = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 0, freeUsed: 0 }));
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Caption source', status: 'done', createdAt: Date.now(), cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 const actor = t.withIdentity({ subject: 'owner' });
 for (const captionFont of ['unknown', '__proto__', 'Arial,100', '../private']) await expect(actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { sourceJobId: source, captionStyle: 'clean', requestId: 'invalid-font', captionFont })).rejects.toThrow();
 expect((await t.run(ctx => ctx.db.get(user)))?.freeUsed).toBe(0);
 const result = await actor.mutation(ref<'mutation'>('generate:requestCaptionEdit'), { sourceJobId: source, captionStyle: 'clean', requestId: 'valid-font', captionFont: 'mono' });
 vi.stubEnv('WORKER_SECRET', 'test-secret');
 try {
  await t.run(ctx => ctx.db.patch(result.jobId, { status: 'dispatched', leaseExpiresAt: Date.now() + 60000, attempts: 1 }));
  expect(await actor.mutation(ref<'mutation'>('generate:claimJob'), { jobId: result.jobId, workerId: 'worker-123', workerSecret: 'test-secret' })).toMatchObject({ captionFont: 'mono' });
 } finally { vi.unstubAllEnvs(); }
});

test('ordinary edits inherit the owned clean caption layer and transform flag through worker claim', async () => {
 const t = convexTest(schema, modules);
 await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 0, freeUsed: 0 }));
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Caption source', status: 'done', createdAt: Date.now(), storageKey: 'videos/source/lease.mp4', cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json', captionStyle: 'meme', captionFont: 'serif', captionPosition: 'top' }));
 const actor = t.withIdentity({ subject: 'owner' });
 await expect(actor.mutation(ref<'mutation'>('generate:requestEdit'), { sourceJobId: source, instruction: 'make captions bold', requestId: 'caption-use-controls' })).rejects.toThrow('USE_CAPTION_CONTROLS');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
 const args = { sourceJobId: source, instruction: 'trim 00:01 to 00:04', requestId: 'transform-request' };
 const first = await actor.mutation(ref<'mutation'>('generate:requestEdit'), args);
 expect(await actor.mutation(ref<'mutation'>('generate:requestEdit'), args)).toEqual(first);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
 const expected = { sourceStorageKey: 'videos/source/lease-clean.mp4', sourceCaptionStorageKey: 'captions/source/lease.json', captionTransform: true, captionStyle: 'meme', captionFont: 'serif', captionPosition: 'top' };
 expect(await t.run(ctx => ctx.db.get(first.jobId))).toMatchObject(expected);
 vi.stubEnv('WORKER_SECRET', 'test-secret');
 try {
  await t.run(ctx => ctx.db.patch(first.jobId, { status: 'dispatched', leaseExpiresAt: Date.now() + 60000, attempts: 1 }));
  expect(await actor.mutation(ref<'mutation'>('generate:claimJob'), { jobId: first.jobId, workerId: 'worker-123', workerSecret: 'test-secret' })).toMatchObject(expected);
 } finally { vi.unstubAllEnvs(); }
});
