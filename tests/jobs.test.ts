import { convexTest } from 'convex-test';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import { ConvexError } from 'convex/values';
import schema from '../convex/schema';
import { FREE_LIMIT, freeDailyRenderCap } from '../convex/config';
const modules = import.meta.glob('../convex/**/*.ts');
const fn = (name: string) => ref<'mutation'>(`generate:${name}`);
const outputMetadata = { mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true };
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('WORKER_SECRET', 'test-secret'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup(count = 1) {
  const t = convexTest(schema, modules);
  for (let i = 0; i < count; i++) await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: `u${i}`, credits: 25, freeUsed: 0 }));
  return t;
}
const submit = (t: ReturnType<typeof convexTest>, user = 'u0', requestId = 'request-00000001') => t.withIdentity({ subject: user }).mutation(fn('requestGeneration'), { mode: 'generate', prompt: 'A reel about space', aspect: '9:16', requestId });
const pump = (t: ReturnType<typeof convexTest>) => t.mutation(ref<'mutation'>('jobs:pump'), {});
const claim = (t: ReturnType<typeof convexTest>, jobId: string) => t.mutation(fn('claimJob'), { workerSecret: 'test-secret', jobId, workerId: 'worker-123' });
test('new jobs reserve five lifetime free videos then paid credits, duplicate submission reserves once', async () => {
  const t = await setup();
  const a = await submit(t); expect(await submit(t)).toEqual(a);
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
test('only ten jobs are admitted globally and one per user', async () => {
  const t = await setup(11);
  for (let i = 0; i < 11; i++) await submit(t, `u${i}`);
  await pump(t);
  const jobs = await t.run(ctx => ctx.db.query('genJobs').collect());
  expect(jobs.filter(j => j.status === 'dispatched')).toHaveLength(10);
  expect(jobs.filter(j => j.status === 'queued')).toHaveLength(1);
});
test('claims and completion are fenced and retries do not charge twice', async () => {
  const t = await setup(); const { jobId } = await submit(t); await pump(t);
  const job = await claim(t, jobId); expect(job).not.toBeNull(); expect(await claim(t, jobId)).toBeNull();
  expect(await t.mutation(fn('completeJob'), { ...outputMetadata, workerSecret: 'test-secret', jobId, leaseToken: 'stale', storageKey: 'bad' })).toBe(false);
  expect(await t.mutation(fn('completeJob'), { ...outputMetadata, workerSecret: 'test-secret', jobId, leaseToken: job.leaseToken, storageKey: `videos/${jobId}/${job.leaseToken}.mp4` })).toBe(true);
  expect(await t.mutation(fn('failJob'), { workerSecret: 'test-secret', jobId, leaseToken: job.leaseToken, error: 'late failure' })).toBe(false);
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
test('expired workers cannot complete and exhausted retries refund exactly once', async () => {
  const t = await setup(); const { jobId } = await submit(t);
  let firstToken = '';
  for (let i = 0; i < 3; i++) {
    await pump(t); const job = await claim(t, jobId); if (!i) firstToken = job.leaseToken;
    vi.setSystemTime(Date.now() + 181_000); await pump(t);
  }
  expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe('failed');
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
  await pump(t);
  expect(await t.mutation(fn('completeJob'), { ...outputMetadata, workerSecret: 'test-secret', jobId, leaseToken: firstToken, storageKey: `videos/${jobId}/${firstToken}.mp4` })).toBe(false);
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});
test('rejects unauthorized workers and invalid generation before spending', async () => {
  const t = await setup(); const { jobId } = await submit(t);
  await expect(t.mutation(fn('claimJob'), { workerSecret: 'wrong', jobId, workerId: 'worker-123' })).rejects.toThrow();
  await expect(t.withIdentity({ subject: 'u0' }).mutation(fn('requestGeneration'), { mode: 'edit', prompt: 'edit this', requestId: 'request-invalid' })).rejects.toThrow();
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
test('successes exhaust the free allowance and the next render reserves one paid credit', async () => {
  const t = await setup();
  for (let i = 0; i <= FREE_LIMIT; i++) {
    const { jobId, billing } = await submit(t, 'u0', `request-test-${i}`);
    expect(billing).toBe(i < FREE_LIMIT ? 'free' : 'credit');
    await pump(t); const j = await claim(t, jobId);
    expect(j.isPro).toBe(i >= FREE_LIMIT);
    await t.mutation(fn('completeJob'), { ...outputMetadata, workerSecret: 'test-secret', jobId, leaseToken: j.leaseToken, storageKey: `videos/${jobId}/${j.leaseToken}.mp4` });
  }
  const user = await t.run(ctx => ctx.db.query('users').first());
  expect(user?.freeUsed).toBe(FREE_LIMIT); expect(user?.credits).toBe(24);
});
test('queued cancellation refunds paid credit once and source edits enforce ownership', async () => {
  const t = await setup(2);
  await t.run(async ctx => { const u = await ctx.db.query('users').first(); await ctx.db.patch(u!._id, { freeUsed: 3 }); });
  const { jobId } = await submit(t);
  await t.withIdentity({ subject: 'u0' }).mutation(fn('cancelJob'), { jobId });
  await expect(t.withIdentity({ subject: 'u0' }).mutation(fn('cancelJob'), { jobId })).rejects.toThrow();
  expect((await t.run(ctx => ctx.db.query('users').first()))?.credits).toBe(25);
  await expect(t.withIdentity({ subject: 'u1' }).mutation(fn('requestEdit'), { sourceJobId: jobId, instruction: 'Make it square', requestId: 'edit-request-123' })).rejects.toThrow();
});
test('queued jobs from the same user cannot take a second active slot', async () => {
  const t = await setup();
  await submit(t, 'u0', 'first-request'); await submit(t, 'u0', 'second-request'); await pump(t);
  expect((await t.run(ctx => ctx.db.query('genJobs').collect())).filter(j => j.status === 'dispatched')).toHaveLength(1);
});
test('signed download action checks owner and refreshes the durable object key', async () => {
  const t = await setup(2); const { jobId } = await submit(t); await pump(t); const j = await claim(t, jobId);
  await t.mutation(fn('completeJob'), { ...outputMetadata, workerSecret: 'test-secret', jobId, leaseToken: j.leaseToken, storageKey: `videos/${jobId}/${j.leaseToken}.mp4`, cleanStorageKey: `videos/${jobId}/${j.leaseToken}-clean.mp4`, captionStorageKey: `captions/${jobId}/${j.leaseToken}.json` });
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://storage.googleapis.com/signed-new' })));
  vi.stubGlobal('fetch', fetcher); vi.stubEnv('DISPATCH_URL', 'https://dispatcher.example'); vi.stubEnv('DISPATCH_SECRET', 'dispatch-secret');
  try {
    await expect(t.withIdentity({ subject: 'u1' }).action(ref<'action'>('generate:getDownload'), { jobId })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await t.withIdentity({ subject: 'u0' }).action(ref<'action'>('generate:getDownload'), { jobId })).toEqual({ url: 'https://storage.googleapis.com/signed-new' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ storageKey: `videos/${jobId}/${j.leaseToken}.mp4` });
    expect(fetcher.mock.calls[0][1].body).not.toContain('-clean.mp4');
  } finally { vi.unstubAllGlobals(); }
});
test('editing to square overrides the source vertical aspect', async () => {
 const t = await setup(); const { jobId } = await submit(t); await pump(t); const j = await claim(t, jobId);
 await t.mutation(fn('completeJob'), { ...outputMetadata, workerSecret: 'test-secret', jobId, leaseToken: j.leaseToken, storageKey: `videos/${jobId}/${j.leaseToken}.mp4` });
 const edit = await t.withIdentity({ subject: 'u0' }).mutation(fn('requestEdit'), { sourceJobId: jobId, instruction: 'Make it square (1:1)', requestId: 'edit-square-123' });
 await pump(t); const claimed = await claim(t, edit.jobId);
 expect(claimed.aspect).toBe('1:1'); expect(claimed.sourceStorageKey).toBe(`videos/${jobId}/${j.leaseToken}.mp4`);
});
test('timestamp trims do not accidentally request square output', async () => {
 const t = await setup(); const { jobId } = await submit(t); await pump(t); const j = await claim(t, jobId);
 await t.mutation(fn('completeJob'), { ...outputMetadata, workerSecret: 'test-secret', jobId, leaseToken: j.leaseToken, storageKey: `videos/${jobId}/${j.leaseToken}.mp4` });
 const edit = await t.withIdentity({ subject: 'u0' }).mutation(fn('requestEdit'), { sourceJobId: jobId, instruction: 'Trim 1:15 to 1:45', requestId: 'edit-timestamp-123' });
 expect((await t.run(ctx => ctx.db.get(edit.jobId)))?.aspect).toBe('9:16');
});
test('legacy account debit endpoint cannot consume an allowance without a job', async () => {
 const t = await setup();
 await expect(t.withIdentity({ subject: 'u0' }).mutation(ref<'mutation'>('credits:consumeGeneration'), {})).rejects.toThrow();
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('caption choice survives reservation, duplicate submission and worker claim', async () => {
 const t = await setup(); const actor = t.withIdentity({ subject: 'u0' });
 const args = { mode: 'generate', prompt: 'A reel about space', requestId: 'caption-request', captionStyle: 'clean' };
 const first = await actor.mutation(fn('requestGeneration'), args);
 expect(await actor.mutation(fn('requestGeneration'), args)).toEqual(first);
 await pump(t);
 expect(await claim(t, first.jobId)).toMatchObject({ captionStyle: 'clean' });
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});
test('invalid caption styles and AI caption settings reject before billing', async () => {
 const t = await setup(); const actor = t.withIdentity({ subject: 'u0' });
 const args = { mode: 'generate', prompt: 'A reel about space', requestId: 'bad-caption-request' };
 await expect(actor.mutation(fn('requestGeneration'), { ...args, captionStyle: 'invalid' })).rejects.toThrow();
 vi.stubEnv('AI_VIDEO_ENABLED', 'true');
 await expect(actor.mutation(fn('requestGeneration'), { ...args, generationKind: 'ai', captionStyle: 'clean' })).rejects.toThrow('AI_CAPTIONS_UNAVAILABLE');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('caption archives attach as a complete lease-owned pair and reject foreign keys', async () => {
 const t = await setup(); const { jobId } = await submit(t); await pump(t); const lease = await claim(t, jobId);
 const args = { workerSecret: 'test-secret', jobId, leaseToken: lease.leaseToken, storageKey: `videos/${jobId}/${lease.leaseToken}.mp4` };
 for (const patch of [{ cleanStorageKey: `videos/${jobId}/${lease.leaseToken}-clean.mp4` }, { cleanStorageKey: 'videos/other/token-clean.mp4', captionStorageKey: `captions/${jobId}/${lease.leaseToken}.json` }]) await expect(t.mutation(fn('completeJob'), { ...outputMetadata, ...args, ...patch })).rejects.toThrow('INVALID_CAPTION_ARCHIVE');
 expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe('processing');
 const archive = { cleanStorageKey: `videos/${jobId}/${lease.leaseToken}-clean.mp4`, captionStorageKey: `captions/${jobId}/${lease.leaseToken}.json` };
 expect(await t.mutation(fn('completeJob'), { ...outputMetadata, ...args, ...archive })).toBe(true);
 expect(await t.run(ctx => ctx.db.get(jobId))).toMatchObject(archive);
 expect(await t.mutation(fn('completeJob'), { ...outputMetadata, ...args, leaseToken: 'stale-token', ...archive })).toBe(false);
});

test('a request ID cannot silently reuse different render instructions', async () => {
 const t = await setup(); const first = await submit(t);
 const actor = t.withIdentity({ subject: 'u0' });
 const base = { mode: 'generate', prompt: 'A reel about space', aspect: '9:16', requestId: 'request-00000001' };
 for (const patch of [{ prompt: 'A reel about oceans' }, { aspect: '1:1' }, { captionStyle: 'none' }]) await expect(actor.mutation(fn('requestGeneration'), { ...base, ...patch })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 // Surrounding whitespace and the explicit default generation kind are equivalent.
 expect(await actor.mutation(fn('requestGeneration'), { ...base, prompt: '  A reel about space  ', generationKind: 'stock' })).toEqual(first);
 await pump(t); await claim(t, first.jobId);
 expect(await submit(t)).toEqual(first);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(1);
});

test('exact music retry survives catalog changes but changed mix cannot reuse its ID', async () => {
 const t = await setup();
 const track = { id: 'beat', label: 'Beat', storageKey: 'music/beat.mp3', attribution: 'Artist' };
 vi.stubEnv('MUSIC_CATALOG_JSON', JSON.stringify([track]));
 const args = { mode: 'generate', prompt: 'A reel about space', requestId: 'music-retry-123', music: { trackId: 'beat', volume: 0.2, duck: true } };
 const actor = t.withIdentity({ subject: 'u0' });
 const first = await actor.mutation(fn('requestGeneration'), args);
 vi.stubEnv('MUSIC_CATALOG_JSON', '[]');
 expect(await actor.mutation(fn('requestGeneration'), args)).toEqual(first);
 await expect(actor.mutation(fn('requestGeneration'), { ...args, music: { ...args.music, volume: 0.5 } })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 await expect(actor.mutation(fn('requestGeneration'), { mode: args.mode, prompt: args.prompt, requestId: args.requestId })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});

test('cancelling a dispatched job blocks late claim and completion without double refund', async () => {
 const t = await setup(); const { jobId } = await submit(t);
 await pump(t);
 await t.withIdentity({ subject: 'u0' }).mutation(fn('cancelJob'), { jobId });
 expect(await claim(t, jobId)).toBeNull();
 expect(await t.mutation(fn('completeJob'), { ...outputMetadata, workerSecret: 'test-secret', jobId, leaseToken: 'worker-123-1', storageKey: `videos/${jobId}/worker-123-1.mp4` })).toBe(false);
 expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe('cancelled');
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});

test('paginated history reaches older than fifty jobs without exposing private worker fields', async () => {
 const t = await setup(2);
 await t.run(async ctx => {
  for (let i = 0; i < 65; i++) await ctx.db.insert('genJobs', { userId: 'u0', mode: 'generate', prompt: `Own video ${i}`, status: 'done', createdAt: Date.now(), captionTexts: ['Private large transcript'], leaseToken: 'worker-private' });
  await ctx.db.insert('genJobs', { userId: 'u1', mode: 'generate', prompt: 'Other account video', status: 'done', createdAt: Date.now() });
 });
 const actor = t.withIdentity({ subject: 'u0' });
 let cursor: string | null = null; const jobs: any[] = [];
 for (let i = 0; i < 10; i++) {
  const result: any = await actor.query(ref<'query'>('generate:listJobs'), { accountKey: 'u0', paginationOpts: { numItems: 20, cursor } });
  jobs.push(...result.page); if (result.isDone) break; cursor = result.continueCursor;
 }
 expect(jobs).toHaveLength(65); expect(new Set(jobs.map(job => job._id)).size).toBe(65);
 expect(jobs.every(job => job.prompt.startsWith('Own video') && !('captionTexts' in job) && !('leaseToken' in job))).toBe(true);
 expect((await actor.query(ref<'query'>('generate:listJobs'), { accountKey: 'u1', paginationOpts: { numItems: 20, cursor: null } })).page).toEqual([]);
 await expect(actor.query(ref<'query'>('generate:listJobs'), { accountKey: 'u0', paginationOpts: { numItems: 1000, cursor: null } })).rejects.toThrow('INVALID_PAGE_SIZE');
 await expect(t.query(ref<'query'>('generate:listJobs'), { accountKey: 'u0', paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow('UNAUTHENTICATED');
});

test('browser job queries return the same exact safe projection without private markers', async () => {
 const t = await setup();
 const privateMarker = 'PRIVATE-MARKER';
 const jobId = await t.run(ctx => ctx.db.insert('genJobs', {
  userId: 'u0', mode: 'edit', prompt: 'Safe prompt', status: 'done', aspect: '16:9', createdAt: 10,
  finishedAt: 20, refunded: true, parentJobId: undefined, resultUrl: 'https://legacy.example/video.mp4',
  storageKey: `videos/job/${privateMarker}.mp4`, sourceStorageKey: `sources/${privateMarker}.mp4`,
  sourceStorageId: undefined, cleanStorageKey: `videos/job/${privateMarker}-clean.mp4`,
  captionStorageKey: `captions/job/${privateMarker}.json`, mediaDurationMs: 1_000,
  mediaWidth: 1920, mediaHeight: 1080, mediaHasAudio: true,
  leaseToken: privateMarker, leaseExpiresAt: 999, aiOperation: privateMarker,
  scenePlan: undefined, captionTexts: [privateMarker], telegramChatId: privateMarker,
  telegramFileId: privateMarker, telegramDeliveryStatus: 'failed',
  music: { trackId: privateMarker, label: 'Licensed track', attribution: 'Artist credit', storageKey: privateMarker, volume: 0.2, duck: true },
  brand: { font: 'sans', captionStyle: 'clean', textColor: '#000000', outlineColor: '#FFFFFF', logo: new TextEncoder().encode(privateMarker).buffer },
  renderProgress: { attempt: 1, startedAt: 11, stages: [{ stage: 'checking', startedAt: 12 }], finishedAt: 19 },
 }));
 const actor = t.withIdentity({ subject: 'u0' });
 const listed = (await actor.query(ref<'query'>('generate:listJobs'), { accountKey: 'u0', paginationOpts: { numItems: 20, cursor: null } })).page.find((row: any) => row._id === jobId);
 const mine = (await actor.query(ref<'query'>('generate:myJobs'), {}).then((rows: any[]) => rows.find(row => row._id === jobId)));
 const selected = await actor.query(ref<'query'>('generate:getJob'), { jobId });
 const expectedKeys = [
  '_id', 'aspect', 'createdAt', 'finishedAt', 'hasCaptionArchive', 'hasOutput', 'hasSource',
  'mode', 'parentJobId', 'prompt', 'refunded', 'renderProgress', 'resultUrl', 'soundtrack',
  'status', 'telegramDeliveryStatus',
 ].sort();
 for (const row of [listed, mine, selected]) {
  expect(Object.keys(row).sort()).toEqual(expectedKeys);
  expect(row).toMatchObject({
   _id: jobId, hasOutput: true, hasSource: true, hasCaptionArchive: true,
   soundtrack: { label: 'Licensed track', attribution: 'Artist credit' },
  });
  expect(JSON.stringify(row)).not.toContain(privateMarker);
 }
});

test('deployment pause blocks new reservations but preserves exact submission retries', async () => {
 const t=await setup(); const first=await submit(t); const before=await t.run(ctx=>ctx.db.query('users').first());
 vi.stubEnv('MANAGED_RENDERING_PAUSED','true');
 expect(await submit(t)).toEqual(first);
 await expect(submit(t,'u0','new-request-0002')).rejects.toThrow('No allowance was used');
 expect(await t.run(ctx=>ctx.db.query('users').first())).toEqual(before);
 expect(await t.run(ctx=>ctx.db.query('genJobs').collect())).toHaveLength(1);
});
test('deployment pause preserves legacy and expired queue records without retries or refunds', async () => {
 const t=await setup();await t.run(async ctx=>{for(let i=0;i<13;i++)await ctx.db.insert('genJobs',{userId:'u0',mode:'generate',prompt:'Legacy request',status:i?'queued':'dispatched',createdAt:1,...(i?{}:{leaseExpiresAt:2,attempts:3})});});
 const before=await t.run(ctx=>ctx.db.query('genJobs').collect());const user=await t.run(ctx=>ctx.db.query('users').first());
 vi.stubEnv('MANAGED_RENDERING_PAUSED','true');await pump(t);
 expect(await t.run(ctx=>ctx.db.query('genJobs').collect())).toEqual(before);expect(await t.run(ctx=>ctx.db.query('users').first())).toEqual(user);
});
test('deployment pause stops scheduled dispatch and late claims, then resumes managed admission', async () => {
 const t=await setup();const {jobId}=await submit(t);await pump(t);const before=await t.run(ctx=>ctx.db.get(jobId));
 vi.stubEnv('MANAGED_RENDERING_PAUSED','true');const fetcher=vi.spyOn(globalThis,'fetch');
 try {await t.action(ref<'action'>('jobs:dispatch'),{jobId,attempt:1});expect(fetcher).not.toHaveBeenCalled();expect(await claim(t,jobId)).toBeNull();expect(await t.run(ctx=>ctx.db.get(jobId))).toEqual(before);}finally{fetcher.mockRestore();}
 vi.stubEnv('MANAGED_RENDERING_PAUSED','false');expect(await claim(t,jobId)).not.toBeNull();
});
test('deployment pause allows an already claimed worker to heartbeat and complete', async()=>{
 const t=await setup();const {jobId}=await submit(t);await pump(t);const job=await claim(t,jobId);vi.stubEnv('MANAGED_RENDERING_PAUSED','true');
 const lease={workerSecret:'test-secret',jobId,leaseToken:job.leaseToken};
 expect(await t.mutation(fn('heartbeat'),lease)).toBe(true);
 expect(await t.mutation(fn('reportProgress'),{...lease,stage:'checking'})).toBe(true);
 expect(await t.mutation(fn('completeJob'),{...outputMetadata,...lease,storageKey:`videos/${jobId}/${job.leaseToken}.mp4`})).toBe(true);
});

test('completion validates metadata before atomically publishing output and metadata', async () => {
 const t=await setup(); const {jobId}=await submit(t); await pump(t); const job=await claim(t,jobId);
 const base={workerSecret:'test-secret',jobId,leaseToken:job.leaseToken,storageKey:`videos/${jobId}/${job.leaseToken}.mp4`};
 for (const patch of [{mediaDurationMs:99},{mediaDurationMs:300_001},{mediaWidth:0},{mediaHeight:16_385}]) {
   await expect(t.mutation(fn('completeJob'),{...outputMetadata,...base,...patch})).rejects.toThrow('INVALID_MEDIA_METADATA');
   const pending=await t.run(ctx=>ctx.db.get(jobId)); expect(pending).toMatchObject({status:'processing'});
   expect(pending).not.toHaveProperty('storageKey'); expect(pending).not.toHaveProperty('mediaDurationMs');
 }
 expect(await t.mutation(fn('completeJob'),{...outputMetadata,...base})).toBe(true);
 expect(await t.run(ctx=>ctx.db.get(jobId))).toMatchObject({status:'done',storageKey:base.storageKey,...outputMetadata});
});

test('stale leases and invalid archive keys cannot persist output metadata', async () => {
 const t=await setup(); const {jobId}=await submit(t); await pump(t); const job=await claim(t,jobId);
 const base={...outputMetadata,workerSecret:'test-secret',jobId,storageKey:`videos/${jobId}/${job.leaseToken}.mp4`};
 expect(await t.mutation(fn('completeJob'),{...base,leaseToken:'stale'})).toBe(false);
 await expect(t.mutation(fn('completeJob'),{...base,leaseToken:job.leaseToken,storageKey:'videos/wrong/key.mp4'})).rejects.toThrow('INVALID_OUTPUT');
 await expect(t.mutation(fn('completeJob'),{...base,leaseToken:job.leaseToken,cleanStorageKey:'videos/wrong/clean.mp4'})).rejects.toThrow('INVALID_CAPTION_ARCHIVE');
 const pending=await t.run(ctx=>ctx.db.get(jobId)); expect(pending).toMatchObject({status:'processing'});
 expect(pending).not.toHaveProperty('storageKey'); expect(pending).not.toHaveProperty('mediaDurationMs');
});

test('completion requires every trusted media field before publishing', async () => {
 const t=await setup(); const {jobId}=await submit(t); await pump(t); const job=await claim(t,jobId);
 const {mediaHeight:_missing,...incomplete}=outputMetadata;
 await expect(t.mutation(fn('completeJob'),{...incomplete,workerSecret:'test-secret',jobId,leaseToken:job.leaseToken,storageKey:`videos/${jobId}/${job.leaseToken}.mp4`} as never)).rejects.toThrow();
 const pending=await t.run(ctx=>ctx.db.get(jobId)); expect(pending).toMatchObject({status:'processing'}); expect(pending).not.toHaveProperty('storageKey');
});

test.each([
 { leaseExpiresAt: undefined }, { leaseExpiresAt: NaN }, { leaseExpiresAt: Infinity },
 { attempts: undefined }, { attempts: 0 }, { attempts: 1.5 },
])('worker cannot claim a malformed dispatch lease %j', async patch => {
 const t = await setup(); const { jobId } = await submit(t); await pump(t);
 await t.run(ctx => ctx.db.patch(jobId, patch));
 const before = await t.run(ctx => ctx.db.get(jobId));
 expect(await claim(t, jobId)).toBeNull();
 expect(await t.run(ctx => ctx.db.get(jobId))).toEqual(before);
 expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(1);
});

const account = (t: ReturnType<typeof convexTest>, user: string) => t.run(ctx => ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', user)).unique());
test('caption language is stored on the job, guards its request ID, and reaches the worker claim', async () => {
 const t = await setup(2); const actor = t.withIdentity({ subject: 'u0' });
 const args = { mode: 'generate', prompt: 'A reel about space', aspect: '9:16', requestId: 'language-request-1', captionLanguage: 'hi' };
 const { jobId } = await actor.mutation(fn('requestGeneration'), args);
 expect((await t.run(ctx => ctx.db.get(jobId)))?.captionLanguage).toBe('hi');
 await expect(actor.mutation(fn('requestGeneration'), { ...args, captionLanguage: 'ta' })).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 const { captionLanguage: _hi, ...unset } = args;
 await expect(actor.mutation(fn('requestGeneration'), unset)).rejects.toThrow('REQUEST_CONTENT_CONFLICT');
 const plain = await submit(t, 'u1');
 expect(await t.run(ctx => ctx.db.get(plain.jobId))).not.toHaveProperty('captionLanguage');
 await pump(t);
 expect((await claim(t, jobId)).captionLanguage).toBe('hi');
 expect((await claim(t, plain.jobId)).captionLanguage).toBeUndefined();
 expect((await account(t, 'u0'))?.freeUsed).toBe(1);
});
test('unlisted caption languages and AI caption languages reject before billing', async () => {
 const t = await setup(); const actor = t.withIdentity({ subject: 'u0' });
 const args = { mode: 'generate', prompt: 'A reel about space', requestId: 'bad-language-request' };
 await expect(actor.mutation(fn('requestGeneration'), { ...args, captionLanguage: 'xx' })).rejects.toThrow();
 vi.stubEnv('AI_VIDEO_ENABLED', 'true');
 await expect(actor.mutation(fn('requestGeneration'), { ...args, generationKind: 'ai', captionLanguage: 'hi' })).rejects.toThrow('AI_CAPTIONS_UNAVAILABLE');
 expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toEqual([]);
 expect((await account(t, 'u0'))?.freeUsed).toBe(0);
});

test('free daily render cap reads a whole non-negative number and otherwise defaults to 150', () => {
 for (const [raw, cap] of [[undefined, 150], ['0', 0], [' 7 ', 7], ['abc', 150], ['-1', 150], ['1.5', 150], ['', 150]] as const) {
  expect(freeDailyRenderCap(raw === undefined ? {} : { FREE_DAILY_RENDER_CAP: raw }), `FREE_DAILY_RENDER_CAP=${String(raw)}`).toBe(cap);
 }
});
test('free renders stop at the UTC daily cap without blocking retries or paid renders, then reopen the next day', async () => {
 const dayStart = Date.UTC(2026, 9, 17); vi.setSystemTime(dayStart + 12 * 3_600_000);
 vi.stubEnv('FREE_DAILY_RENDER_CAP', '2');
 const t = await setup(4);
 await t.run(async ctx => {
  const payer = await ctx.db.query('users').withIndex('by_token', q => q.eq('tokenIdentifier', 'u3')).unique();
  await ctx.db.patch(payer!._id, { freeUsed: FREE_LIMIT, credits: 5 });
  // Neither yesterday's free render nor today's paid render may count toward today's free cap.
  await ctx.db.insert('genJobs', { userId: 'earlier', mode: 'generate', prompt: 'Yesterday free video', status: 'done', reservation: 'free', createdAt: dayStart - 1 });
  await ctx.db.insert('genJobs', { userId: 'payer', mode: 'generate', prompt: 'Paid video', status: 'done', reservation: 'credit', createdAt: dayStart + 1 });
 });
 const first = await submit(t, 'u0', 'cap-request-0');
 expect(first.billing).toBe('free');
 expect((await submit(t, 'u1', 'cap-request-1')).billing).toBe('free');
 const capped = await submit(t, 'u2', 'cap-request-2').catch(error => error);
 expect(capped).toBeInstanceOf(ConvexError);
 expect(capped.data).toEqual({ code: 'FREE_DAILY_CAP', message: "Today's free renders are used up. Try again tomorrow. No allowance was used." });
 expect(await t.run(ctx => ctx.db.query('genJobs').withIndex('by_user', q => q.eq('userId', 'u2')).collect())).toEqual([]);
 expect((await account(t, 'u2'))?.freeUsed).toBe(0);
 expect(await submit(t, 'u0', 'cap-request-0')).toEqual(first);
 expect(await submit(t, 'u3', 'cap-request-3')).toMatchObject({ billing: 'credit' });
 expect(await account(t, 'u3')).toMatchObject({ freeUsed: FREE_LIMIT, credits: 4 });
 vi.setSystemTime(dayStart + 86_400_000 + 1_000);
 expect(await submit(t, 'u2', 'cap-request-2')).toMatchObject({ billing: 'free' });
 expect((await account(t, 'u2'))?.freeUsed).toBe(1);
});
