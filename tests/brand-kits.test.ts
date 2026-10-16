import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import { FREE_LIMIT } from '../convex/config';
const modules = import.meta.glob('../convex/**/*.ts');
const mutation = (name: string) => ref<'mutation'>(name);
const settings = { font: 'serif', captionStyle: 'meme', textColor: '#11aa55', outlineColor: '#221100' };
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('WORKER_SECRET', 'test-secret'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() { const t = convexTest(schema, modules); for (const subject of ['owner', 'other']) await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: subject, credits: 5, freeUsed: 0 })); return { t, owner: t.withIdentity({ subject: 'owner' }), other: t.withIdentity({ subject: 'other' }) }; }
const create = (t: any, extra = {}) => t.mutation(mutation('brandKits:save'), { name: 'Soap studio', settings, ...extra });
const submit = (t: any, brandKit: any, requestId = 'brand-request-1') => t.mutation(mutation('generate:requestGeneration'), { mode: 'generate', prompt: 'A soap making tutorial', requestId, brandKit });
test('kit save and owner list are free, account-key bound and isolated', async () => {
 const { t, owner, other } = await setup(); const selection = await create(owner);
 expect((await owner.query(ref<'query'>('brandKits:list'), { accountKey: 'owner' }))[0]).toMatchObject({ _id: selection.kitId, settings: { textColor: '#11AA55' } });
 expect(await other.query(ref<'query'>('brandKits:list'), { accountKey: 'owner' })).toEqual([]);
 expect(await other.query(ref<'query'>('brandKits:list'), { accountKey: 'other' })).toEqual([]);
 await expect(create(other, { ...selection, name: 'Stolen' })).rejects.toThrow('BRAND_KIT_NOT_FOUND');
 expect((await t.run(ctx => ctx.db.query('users').collect())).every(u => u.freeUsed === 0 && u.credits === 5)).toBe(true);
 await expect(create(t)).rejects.toThrow('UNAUTHENTICATED');
});
test('job snapshot is immutable and exact retry survives changed kit without a second debit', async () => {
 const { t, owner } = await setup(); const selection = await create(owner); const first = await submit(owner, selection);
 await create(owner, { ...selection, settings: { ...settings, textColor: '#FF0000' } });
 expect(await submit(owner, selection)).toEqual(first);
 const job = await t.run(ctx => ctx.db.get(first.jobId)); expect(job?.brand?.textColor).toBe('#11AA55'); expect(job?.captionStyle).toBe('meme'); expect(job?.captionFont).toBe('serif');
 await expect(submit(owner, selection, 'brand-request-2')).rejects.toThrow('BRAND_KIT_CHANGED');
 await expect(submit(owner, { ...selection, revision: 2 })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
test('foreign kit and stale edits reject before reservation', async () => {
 const { t, owner, other } = await setup(); const selection = await create(owner);
 await expect(submit(other, selection)).rejects.toThrow('BRAND_KIT_NOT_FOUND');
 await create(owner, { ...selection, name: 'Updated' });
 await expect(create(owner, { ...selection, name: 'Old update' })).rejects.toThrow('BRAND_KIT_CHANGED');
 expect((await t.run(ctx => ctx.db.query('genJobs').collect()))).toHaveLength(0);
});
test.each([{ ...settings, font: 'arbitrary-font' }, { ...settings, textColor: 'red;movie=http://evil' }, { ...settings, outlineColor: '#FFF' }, { ...settings, logo: new TextEncoder().encode('<svg/>').buffer }, { ...settings, logo: new ArrayBuffer(65537) }])('rejects unsafe settings and logo bytes', async invalid => {
 const { owner } = await setup(); await expect(create(owner, { settings: invalid })).rejects.toThrow();
});
test('caps owner kits at five and supports updates at the limit', async () => {
 const { owner } = await setup(); const first = await create(owner);
 for (let i = 0; i < 4; i++) await create(owner, { name: `Kit ${i}` });
 await expect(create(owner)).rejects.toThrow('BRAND_KIT_LIMIT');
 expect(await create(owner, { ...first, name: 'Renamed' })).toMatchObject({ revision: 2 });
});
test('brand application requires owned retained source and inherits snapshot on caption edits', async () => {
 const { t, owner, other } = await setup(); const kit = await create(owner);
 const source = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'Original', requestId: 'original-request', status: 'done', createdAt: 1, reservation: 'free', storageKey: 'videos/source/lease.mp4', cleanStorageKey: 'videos/source/lease-clean.mp4', captionStorageKey: 'captions/source/lease.json' }));
 const args = { sourceJobId: source, brandKit: kit, requestId: 'apply-brand-request' };
 await expect(other.mutation(mutation('generate:requestBrandEdit'), args)).rejects.toThrow('NOT_FOUND');
 const { jobId } = await owner.mutation(mutation('generate:requestBrandEdit'), args);
 const job = await t.run(ctx => ctx.db.get(jobId)); expect(job?.brand?.font).toBe('serif'); expect(job?.sourceStorageKey).toBe('videos/source/lease-clean.mp4');
 await t.run(ctx => ctx.db.patch(jobId, { status: 'done', storageKey: 'videos/next/lease.mp4', cleanStorageKey: 'videos/next/lease-clean.mp4', captionStorageKey: 'captions/next/lease.json' }));
 const next = await owner.mutation(mutation('generate:requestCaptionEdit'), { sourceJobId: jobId, captionStyle: 'clean', captionFont: 'mono', requestId: 'caption-brand-next' });
 expect((await t.run(ctx => ctx.db.get(next.jobId)))?.brand).toEqual(job?.brand);
 await t.run(ctx => ctx.db.patch(source, { cleanStorageKey: undefined }));
 await expect(owner.mutation(mutation('generate:requestBrandEdit'), { ...args, requestId: 'missing-archive-request' })).rejects.toThrow('CAPTION_SOURCE_UNAVAILABLE');
});
test('branded paid reservations still debit once and set paid worker claim', async () => {
 const { t, owner } = await setup(); await t.run(async ctx => { const u = await ctx.db.query('users').first(); await ctx.db.patch(u!._id, { freeUsed: FREE_LIMIT }); });
 const kit = await create(owner), result = await submit(owner, kit);
 expect(result.billing).toBe('credit'); expect(await submit(owner, kit)).toEqual(result);
 await t.mutation(mutation('jobs:pump'), {});
 const claim = await t.mutation(mutation('generate:claimJob'), { jobId: result.jobId, workerId: 'brand-worker', workerSecret: 'test-secret' });
 expect(claim.isPro).toBe(true); expect(claim.brand).toMatchObject({ font: 'serif', textColor: '#11AA55' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(4);
});

test('PNG snapshot transports bounded owned bytes and rejects SVG, oversized dimensions and trailing data', async () => {
 const { t, owner } = await setup();
 const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
 const kit = await create(owner, { settings: { ...settings, logo: bytes.buffer } });
 const { jobId } = await submit(owner, kit); await t.mutation(mutation('jobs:pump'), {});
 const claim = await t.mutation(mutation('generate:claimJob'), { jobId, workerId: 'logo-worker', workerSecret: 'test-secret' });
 expect(claim.brand.logo).toEqual(Array.from(bytes));
 const oversized = bytes.slice(); new DataView(oversized.buffer).setUint32(16, 513);
 await expect(create(owner, { settings: { ...settings, logo: oversized.buffer } })).rejects.toThrow('INVALID_BRAND_LOGO');
 const appended = new Uint8Array(bytes.length + 1); appended.set(bytes);
 await expect(create(owner, { settings: { ...settings, logo: appended.buffer } })).rejects.toThrow('INVALID_BRAND_LOGO');
});
