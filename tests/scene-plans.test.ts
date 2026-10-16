import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import type { SavedScenePlan } from '../convex/scenePlanValues';
const modules = import.meta.glob('../convex/**/*.ts');
const outputMetadata = { mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true };
const plan = (): SavedScenePlan => ({ version: 1, durationSec: 6, scenes: [
  { startSec: 0, endSec: 3, purpose: 'Texture', searchTerms: ['soap macro'], shotType: 'macro', motion: 'static' },
  { startSec: 3, endSec: 6, purpose: 'Use', searchTerms: ['hands washing'], shotType: 'close up', motion: 'pan' },
] });
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('WORKER_SECRET', 'scene-test-secret'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const jobId = await t.run(ctx => ctx.db.insert('genJobs', { userId: 'owner', mode: 'generate', prompt: 'soap', status: 'dispatched', attempts: 1, createdAt: Date.now(), leaseExpiresAt: Date.now() + 60000 }));
  const call = (name: string, args: object) => t.mutation(ref<'mutation'>(name), { workerSecret: 'scene-test-secret', ...args });
  const claim = await call('generate:claimJob', { jobId, workerId: 'scene-worker' });
  const args = { jobId, leaseToken: claim.leaseToken };
  const save = (value = plan(), extra = {}) => call('scenePlans:save', { ...args, plan: value, ...extra });
  const get = (subject = 'owner', accountKey = subject, id = jobId as string) => t.withIdentity({ subject }).query(ref<'query'>('scenePlans:get'), { jobId: id, accountKey });
  return { t, jobId, call, args, save, get };
}
test('owner reads a bounded plan before and after exact-lease completion with no internal fields', async () => {
  const { get, save, call, args, jobId } = await setup();
  expect(await get()).toEqual({ state: 'unavailable', scenes: [] });
  expect(await save()).toBe(true); expect(await save()).toBe(true);
  expect(await get()).toEqual({ state: 'rendering', attempt: 1, durationSec: 6, scenes: plan().scenes });
  await call('generate:completeJob', { ...outputMetadata, ...args, storageKey: `videos/${jobId}/${args.leaseToken}.mp4` });
  expect(await get()).toEqual({ state: 'completed', attempt: 1, durationSec: 6, scenes: plan().scenes });
  expect(await save()).toBe(false);
});
test('enforces worker and owner authorization, account reset and malformed IDs', async () => {
  const { t, jobId, args, get, save } = await setup();
  await expect(t.mutation(ref<'mutation'>('scenePlans:save'), { ...args, workerSecret: 'wrong', plan: plan() })).rejects.toThrow();
  await expect(t.query(ref<'query'>('scenePlans:get'), { jobId, accountKey: 'owner' })).rejects.toThrow('UNAUTHENTICATED');
  await save();
  expect(await get('other')).toBeNull(); expect(await get('owner', 'other')).toBeNull(); expect(await get('owner', 'owner', 'bad')).toBeNull();
  const userId = await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'owner', credits: 0, freeUsed: 0 }));
  expect(await get('owner', 'owner', userId)).toBeNull();
});
test('rejects stale and expired leases, immutable plan changes, and non-stock jobs', async () => {
  const { t, jobId, save, get } = await setup();
  expect(await save(plan(), { leaseToken: 'stale-worker-1' })).toBe(false);
  await save();
  const changed = plan(); changed.scenes[0].purpose = 'Changed';
  await expect(save(changed)).rejects.toThrow('SCENE_PLAN_CONFLICT');
  await t.run(ctx => ctx.db.patch(jobId, { leaseExpiresAt: Date.now() - 1 }));
  expect(await save()).toBe(false); expect((await get()).state).toBe('previous_attempt');
  await t.run(ctx => ctx.db.patch(jobId, { leaseExpiresAt: Date.now() + 60000, generationKind: 'ai' }));
  await expect(save()).rejects.toThrow('SCENE_PLAN_UNAVAILABLE');
  await t.run(ctx => ctx.db.patch(jobId, { generationKind: undefined, mode: 'edit' }));
  await expect(save()).rejects.toThrow('SCENE_PLAN_UNAVAILABLE');
});
test('failed attempts remain labelled until claim resets and a new completed attempt gets its own plan', async () => {
  const { t, jobId, save, get, call, args } = await setup();
  await save(); await call('generate:failJob', { ...args, error: 'provider failed' });
  expect((await get()).state).toBe('previous_attempt');
  await t.run(ctx => ctx.db.patch(jobId, { status: 'dispatched', attempts: 2, leaseExpiresAt: Date.now() + 60000 }));
  const claim = await call('generate:claimJob', { jobId, workerId: 'next-worker' });
  expect(await get()).toEqual({ state: 'unavailable', scenes: [] });
  expect(await save()).toBe(false);
  const changed = plan(); changed.scenes[0].purpose = 'New attempt';
  await call('scenePlans:save', { jobId, leaseToken: claim.leaseToken, plan: changed });
  await call('generate:completeJob', { ...outputMetadata, jobId, leaseToken: claim.leaseToken, storageKey: `videos/${jobId}/${claim.leaseToken}.mp4` });
  expect(await get()).toEqual({ state: 'completed', attempt: 2, durationSec: 6, scenes: changed.scenes });
});
test.each(['failed', 'cancelled', 'done'])('never claims a mismatched output exists for %s', async status => {
  const { t, jobId, save, get } = await setup(); await save();
  await t.run(ctx => ctx.db.patch(jobId, { status, leaseToken: undefined, storageKey: 'videos/wrong/output.mp4' }));
  expect((await get()).state).toBe(status === 'done' ? 'previous_attempt' : status);
});
test.each([
  (p: SavedScenePlan) => { p.scenes = []; },
  (p: SavedScenePlan) => { p.scenes = Array(13).fill(p.scenes[0]); },
  (p: SavedScenePlan) => { p.scenes[0].startSec = -1; },
  (p: SavedScenePlan) => { p.scenes[1].startSec = 4; },
  (p: SavedScenePlan) => { p.scenes[1].endSec = NaN; },
  (p: SavedScenePlan) => { p.scenes[0].endSec = 0; },
  (p: SavedScenePlan) => { p.durationSec = 301; },
  (p: SavedScenePlan) => { p.durationSec = 7; },
  (p: SavedScenePlan) => { p.scenes[0].purpose = 'x'.repeat(301); },
  (p: SavedScenePlan) => { p.scenes[0].purpose = 'bad\ntext'; },
  (p: SavedScenePlan) => { p.scenes[0].motion = ''; },
  (p: SavedScenePlan) => { p.scenes[0].shotType = 'x'.repeat(81); },
  (p: SavedScenePlan) => { p.scenes[0].searchTerms = []; },
  (p: SavedScenePlan) => { p.scenes[0].searchTerms = Array(5).fill('x'); },
  (p: SavedScenePlan) => { p.scenes[0].searchTerms = ['x'.repeat(120), 'y'.repeat(120)]; },
])('rejects invalid saved timing and text bounds %#', async mutate => {
  const { save, get } = await setup(); const p = plan(); mutate(p);
  await expect(save(p)).rejects.toThrow('INVALID_SCENE_PLAN');
  expect((await get()).state).toBe('unavailable');
});
test('reordered JSON object keys remain an exact retry after storage serialization', async () => {
  const { save } = await setup(); const original = plan(); await save(original);
  const reordered = { scenes: original.scenes.map(s => ({ motion: s.motion, shotType: s.shotType, searchTerms: s.searchTerms,
    purpose: s.purpose, endSec: s.endSec, startSec: s.startSec })), durationSec: original.durationSec, version: original.version };
  expect(await save(reordered)).toBe(true);
});
test('encoder-grid scene projection stays contiguous through fractional ordered trims and speed', async () => {
  const { scenePlanAtOutput } = await import('../backend/src/content/sceneProjection');
  const { save, get } = await setup();
  const source = { ...plan(), brief: { audience: 'buyers', promise: 'soap', visualNouns: ['soap'], setting: 'bathroom', lighting: 'day', cameraMotion: 'still', pacing: 'calm', restrictedTerms: [] } };
  source.scenes[0].endSec = source.scenes[1].startSec = 3.015;
  const output = scenePlanAtOutput(source, [{ op: 'trim', start: '00:00.125', end: '00:05.875' }, { op: 'speed', factor: 1.5 }]);
  expect(await save(output)).toBe(true);
  expect((await get()).scenes).toEqual(output.scenes);
});
test('legacy job queries do not expose the new plan storage or fencing fields', async () => {
  const { t, jobId, save } = await setup(); await save();
  const owner = t.withIdentity({ subject: 'owner' });
  const job = await owner.query(ref<'query'>('generate:getJob'), { jobId });
  const jobs = await owner.query(ref<'query'>('generate:myJobs'), {});
  for (const row of [job, ...jobs]) {
    expect(row._id).toBe(jobId);
    expect(row).not.toHaveProperty('scenePlan'); expect(row).not.toHaveProperty('scenePlanAttempt'); expect(row).not.toHaveProperty('scenePlanLeaseToken');
  }
});
