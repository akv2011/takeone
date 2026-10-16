import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => { vi.unstubAllEnvs(); });
const track = { id: 'upbeat', label: 'Upbeat', storageKey: 'music/upbeat.mp3', attribution: 'Licensed test fixture' };
async function setup() {
  vi.stubEnv('MUSIC_CATALOG_JSON', JSON.stringify([track]));
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert('users', { tokenIdentifier: 'u1', freeUsed: 0, credits: 0 }));
  return t;
}
test('catalog exposes labels and attribution without bucket object keys', async () => {
  const t = await setup();
  expect(await t.query(ref<'query'>('music:listTracks'), {})).toEqual([{ id: 'upbeat', label: 'Upbeat', attribution: track.attribution }]);
});
test('job snapshots an approved track and selected mix settings', async () => {
  const t = await setup();
  const result = await t.withIdentity({ subject: 'u1' }).mutation(ref<'mutation'>('generate:requestGeneration'), {
    mode: 'generate', prompt: 'An introduction to cooking', requestId: 'music-request-1', music: { trackId: 'upbeat', volume: 0.2, duck: true, replaceSourceAudio: true },
  });
  expect((await t.run(ctx => ctx.db.get(result.jobId)))?.music).toMatchObject({ storageKey: track.storageKey, volume: 0.2, duck: true, replaceSourceAudio: true, attribution: track.attribution });
});
test.each([{ trackId: '../secret', volume: 0.2, duck: true }, { trackId: 'upbeat', volume: 3, duck: true }])('invalid soundtrack selection does not spend allowance', async music => {
  const t = await setup();
  await expect(t.withIdentity({ subject: 'u1' }).mutation(ref<'mutation'>('generate:requestGeneration'), {
    mode: 'generate', prompt: 'An introduction to cooking', requestId: 'music-request-1', music,
  })).rejects.toThrow('MUSIC_UNAVAILABLE');
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
});
test('an unconfigured library exposes no fictional tracks', async () => {
  const t = await setup(); vi.stubEnv('MUSIC_CATALOG_JSON', '');
  expect(await t.query(ref<'query'>('music:listTracks'), {})).toEqual([]);
});

test('preview signs only approved music for authenticated users without reserving allowance', async () => {
 const t = await setup(); vi.stubEnv('DISPATCH_URL', 'https://dispatcher.test'); vi.stubEnv('DISPATCH_SECRET', 'secret');
 const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://storage.test/short-lived' })));
 vi.stubGlobal('fetch', request);
 try {
  await expect(t.action(ref<'action'>('music:preview'), { trackId: 'upbeat' })).rejects.toThrow('UNAUTHENTICATED');
  const actor = t.withIdentity({ subject: 'u1' });
  await expect(actor.action(ref<'action'>('music:preview'), { trackId: '../private' })).rejects.toThrow('MUSIC_UNAVAILABLE');
  expect(request).not.toHaveBeenCalled();
  expect(await actor.action(ref<'action'>('music:preview'), { trackId: 'upbeat' })).toEqual({ url: 'https://storage.test/short-lived' });
  expect(request.mock.calls[0][0]).toBe('https://dispatcher.test/sign-music');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ storageKey: 'music/upbeat.mp3' });
  expect((await t.run(ctx => ctx.db.query('users').first()))?.freeUsed).toBe(0);
  expect(await t.run(ctx => ctx.db.query('genJobs').collect())).toHaveLength(0);
 } finally { vi.unstubAllGlobals(); }
});
