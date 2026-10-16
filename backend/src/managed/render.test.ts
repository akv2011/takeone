import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { replaceSceneVideo } from '../media/sceneReplacement.js';
import { createManagedRenderer } from './render.js';
import type { ClaimedJob } from './worker.js';
import type { SavedScenePlan } from '../types.js';
import type { ExecutorOptions } from '../queue/index.js';
import { createTakeOne } from '../app.js';
import type { Bucket } from '@google-cloud/storage';
const mocks = vi.hoisted(() => ({
  logo: vi.fn(async () => '/tmp/brand.mp4'),
  scene: vi.fn(async () => 'videos/job1/ai.mp4'), op: vi.fn(async () => ({ outputPath: '/tmp/render.mp4' })),
  motion: vi.fn(async () => {}),
  restyle: vi.fn(async () => '/tmp/restyled.mp4'), transform: vi.fn(async () => '/tmp/transformed.mp4'),
  download: vi.fn(async () => {}), music: vi.fn(async () => {}),
  delivery: vi.fn(async () => '/tmp/delivery.mp4'),
  handle: vi.fn(async () => [{ kind: 'file', filePath: '/tmp/render.mp4' }]),
  pick: vi.fn(async () => [{ start: 1, end: 3 }]),
  assembly: vi.fn(async () => '/tmp/assembly.mp4'),
}));
vi.mock('../media/sceneReplacement.js', () => ({ replaceSceneVideo: vi.fn(async () => '/tmp/caption-free.mp4') }));
vi.mock('../media/brand.js', async original => ({ ...await original<object>(), applyBrandLogo: mocks.logo }));
vi.mock('../video/veo.js', () => ({ generateScene: mocks.scene }));
vi.mock('../video/motion.js', () => ({ assertGeneratedVideoMotion: mocks.motion }));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { async getClient() { return {}; } } }));
vi.mock('../media/index.js', () => ({ mediaCore: { runOp: mocks.op } }));
vi.mock('../media/captionRestyle.js', () => ({ restyleCaptionArchive: mocks.restyle, replaceCaptionTexts: vi.fn() }));
vi.mock('../media/captionTransform.js', () => ({ transformCaptionArchive: mocks.transform }));
vi.mock('../media/captionArchive.js', () => ({ canArchiveCaptionLayer: () => false }));
vi.mock('./files.js', () => ({ boundedDownload: mocks.download }));
vi.mock('./soundtrack.js', () => ({ downloadSoundtrack: mocks.music }));
vi.mock('../media/delivery.js', () => ({ prepareDelivery: mocks.delivery }));
vi.mock('../app.js', () => ({ createTakeOne: vi.fn((_options: { executor?: ExecutorOptions }) => ({ handle: mocks.handle })) }));
vi.mock('../moments.js', () => ({ pickMoments: mocks.pick }));
vi.mock('../media/assembly.js', () => ({ renderAssembly: mocks.assembly }));
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<object>(), readFile: vi.fn(async () => '{"cues":[{"start":0,"end":6,"text":"saved"}]}') }));
const base: ClaimedJob = { jobId: 'job1', userId: 'u', mode: 'generate', prompt: 'topic', aspect: '9:16', isPro: false, leaseToken: 'lease1' };
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
function setup(accepted = true) {
  const stages: string[] = [];
  const saveScenePlan = vi.fn(async (_job: ClaimedJob, _plan: SavedScenePlan) => true);
  const render = createManagedRenderer({ work: '/tmp', bucket: { file: () => ({ createReadStream: () => ({}) }) } as unknown as Pick<Bucket, 'file'>,
    saveScenePlan, env: () => 'configured', call: async () => true, telegram: async () => ({}), onArchive: () => {},
    sendProgress: async (_job, stage) => { stages.push(stage); return accepted; },
  });
  return { stages, render, saveScenePlan };
}
test.each([false, true])('Veo records actual footage/checking stages and only reports sound when selected (%s)', async music => {
  const { render, stages } = setup();
  await render({ ...base, generationKind: 'ai', music: music ? { storageKey: 'music/track', volume: 0.2, duck: true } : undefined }, new AbortController().signal);
  expect(stages).toEqual(['footage', 'cut', ...(music ? ['finishing'] : []), 'checking']);
  expect(mocks.scene).toHaveBeenCalledOnce();
  expect(mocks.scene.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
    prompt: expect.stringContaining('CHARACTER CONTINUITY LOCK'),
  }));
  expect(mocks.delivery).toHaveBeenCalledOnce();
});
test('AI generation rejects static/slideshow-like provider output before editing or delivery', async () => {
  const { render } = setup();
  mocks.motion.mockRejectedValueOnce(Error('AI provider returned a static or slideshow-like result'));
  await expect(render({ ...base, generationKind: 'ai' }, new AbortController().signal)).rejects.toThrow('static or slideshow-like');
  expect(mocks.op).not.toHaveBeenCalled();
  expect(mocks.delivery).not.toHaveBeenCalled();
});
test.each(['none', 'clean'] as const)('caption archive %s skips script, footage and transcription', async captionStyle => {
  const { render, stages } = setup();
  await render({ ...base, mode: 'edit', sourceStorageKey: 'videos/parent/lease-clean.mp4', sourceCaptionStorageKey: 'captions/parent/lease.json', captionStyle }, new AbortController().signal);
  expect(stages).toEqual(['source', captionStyle === 'none' ? 'cut' : 'finishing', 'checking']);
  expect(mocks.restyle).toHaveBeenCalledOnce();
  expect(mocks.scene).not.toHaveBeenCalled();
});
test('archive transform uses the cut path without claiming narration or caption generation', async () => {
  const { render, stages } = setup();
  await render({ ...base, mode: 'edit', sourceStorageKey: 'videos/parent/lease-clean.mp4', sourceCaptionStorageKey: 'captions/parent/lease.json', captionTransform: true, transforms: { speed: 2 }, captionStyle: 'none' }, new AbortController().signal);
  expect(stages).toEqual(['source', 'cut', 'checking']);
  expect(mocks.transform).toHaveBeenCalledOnce();
});
test.each([false, true])('clip highlight selection is recorded only for automatic ranges (%s)', async explicit => {
  const { render, stages } = setup();
  await render({ ...base, mode: 'clip', prompt: `https://youtu.be/abc123 ${explicit ? '00:01 to 00:03' : ''}` }, new AbortController().signal);
  expect(stages).toEqual([...(explicit ? [] : ['moments']), 'checking']);
  expect(mocks.pick).toHaveBeenCalledTimes(explicit ? 0 : 1);
});
test('a stored clip sends its bucket object to moment picking and rejects foreign keys', async () => {
  const { render, stages } = setup();
  await render({ ...base, mode: 'clip', prompt: 'best moment', sourceStorageKey: 'videos/u/upload.mp4' }, new AbortController().signal);
  expect(mocks.pick).toHaveBeenCalledWith({ gcsUri: 'gs://configured/videos/u/upload.mp4' }, 1, expect.any(AbortSignal));
  expect(stages).toEqual(['moments', 'source', 'checking']);
  await expect(render({ ...base, mode: 'clip', prompt: 'best moment', sourceStorageKey: '../other/x.mp4' }, new AbortController().signal)).rejects.toThrow('Invalid source key');
});
test('pre-aborted render stops before downloading or executing media', async () => {
  const { render, stages } = setup();
  const controller = new AbortController(); controller.abort();
  await expect(render({ ...base, generationKind: 'ai' }, controller.signal)).rejects.toThrow();
  expect(stages).toEqual([]);
  expect(mocks.scene).not.toHaveBeenCalled();
});

test('timeline export uses the isolated assembly path, watermark and delivery validation', async () => {
  const { render, stages } = setup();
  const timelineExport = { profile: { container: 'mp4' as const, fps: 30 as const }, timeline: { version: 1 as const, aspect: '9:16' as const, durationMs: 2000,
    video: [
      { id: 'a', source: { kind: 'job' as const, jobId: 'one' }, sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 0, fit: 'crop' as const, muted: false },
      { id: 'b', source: { kind: 'job' as const, jobId: 'two' }, sourceStartMs: 0, sourceEndMs: 1000, timelineStartMs: 1000, fit: 'fit' as const, muted: false },
    ], transitions: [{ id: 't', fromClipId: 'a', toClipId: 'b', type: 'cut' as const, durationMs: 0 }], text: [] as never[], graphics: [] as never[] } };
  const assemblySources = [
    { source: { kind: 'job' as const, jobId: 'one' }, storageKey: 'videos/one/lease.mp4', durationMs: 1000, width: 100, height: 100, hasAudio: true },
    { source: { kind: 'job' as const, jobId: 'two' }, storageKey: 'videos/two/lease.mp4', durationMs: 1000, width: 100, height: 100, hasAudio: false },
  ];
  const signal = new AbortController().signal;
  await render({ ...base, mode: 'edit', timelineExport, assemblySources }, signal);
  expect(mocks.assembly).toHaveBeenCalledWith(timelineExport, assemblySources, '/tmp/assembly.mp4', '/tmp', expect.objectContaining({ convexUrl: 'configured' }), signal);
  expect(mocks.op).toHaveBeenCalledWith('/tmp/assembly.mp4', expect.objectContaining({ op: 'watermark', show: true }), expect.anything());
  expect(mocks.delivery).toHaveBeenCalledWith('/tmp/render.mp4', '/tmp/delivery.mp4', expect.objectContaining({ requireAudio: true }), signal);
  expect(stages).toEqual(['source', 'cut', 'checking']);
  expect(mocks.handle).not.toHaveBeenCalled();
});

test('timeline export fails closed without the worker-only source mapping', async () => {
  const { render } = setup();
  await expect(render({ ...base, mode: 'edit', timelineExport: {} as never }, new AbortController().signal)).rejects.toThrow('Invalid assembly claim');
  expect(mocks.assembly).not.toHaveBeenCalled();
});

test('timeline export rejects a claim whose job aspect differs from its immutable timeline', async () => {
  const { render } = setup();
  const timelineExport = { profile: { container: 'mp4' as const, fps: 30 as const }, timeline: { version: 1 as const, aspect: '16:9' as const, durationMs: 1, video: [] as never[], transitions: [] as never[], text: [] as never[], graphics: [] as never[] } };
  await expect(render({ ...base, mode: 'edit', timelineExport, assemblySources: [] }, new AbortController().signal)).rejects.toThrow('Invalid assembly claim');
  expect(mocks.assembly).not.toHaveBeenCalled();
});

test('explicit progress lease rejection prevents provider work', async () => {
  const { render, stages } = setup(false);
  await expect(render({ ...base, generationKind: 'ai' }, new AbortController().signal)).rejects.toThrow('Render lease lost');
  expect(stages).toEqual(['footage']);
  expect(mocks.scene).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});

const plan: SavedScenePlan = { version: 1, durationSec: 6, scenes: [
  { startSec: 0, endSec: 3, purpose: 'Texture', searchTerms: ['soap'], shotType: 'macro', motion: 'still' },
  { startSec: 3, endSec: 6, purpose: 'Use', searchTerms: ['hands'], shotType: 'wide', motion: 'pan' },
] };
test('managed renderer forwards the exact claimed job and plan to its awaited persistence transport', async () => {
  const { render, saveScenePlan } = setup(); const signal = new AbortController().signal;
  await render(base, signal);
  const onScenePlan = vi.mocked(createTakeOne).mock.calls.at(-1)![0]!.executor!.onScenePlan!;
  let release!: () => void; const gate = new Promise<boolean>(resolve => { release = () => resolve(true); });
  saveScenePlan.mockReturnValueOnce(gate);
  let settled = false; const pending = onScenePlan(plan).then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false);
  expect(saveScenePlan).toHaveBeenCalledWith(base, plan);
  release(); await pending;
});
test.each(['reject', 'transport', 'abort'])('managed scene callback fails closed on %s', async mode => {
  const { render, saveScenePlan } = setup(); const controller = new AbortController();
  await render(base, controller.signal);
  const onScenePlan = vi.mocked(createTakeOne).mock.calls.at(-1)![0]!.executor!.onScenePlan!;
  if (mode === 'reject') saveScenePlan.mockResolvedValueOnce(false);
  if (mode === 'transport') saveScenePlan.mockRejectedValueOnce(Error('transport unavailable'));
  if (mode === 'abort') saveScenePlan.mockImplementationOnce(async () => { controller.abort(Error('lease cancelled')); return true; });
  await expect(onScenePlan(plan)).rejects.toThrow(mode === 'reject' ? 'Scene plan lease lost' : mode === 'transport' ? 'transport unavailable' : 'lease cancelled');
});

test.each([true,false])('scene replacement retains archive/audio path and fences the saved plan (%s)', async accepted => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('uploaded video')));
  const onArchive = vi.fn(), saveScenePlan = vi.fn(async () => accepted);
  const render = createManagedRenderer({ work: '/tmp', bucket: { file: () => ({ createReadStream: () => ({}) }) } as unknown as Pick<Bucket,'file'>,
    env: () => 'https://example.convex.cloud', call: async () => true, telegram: async () => ({}), onArchive, saveScenePlan, sendProgress: async () => true });
  const job = { ...base, mode: 'edit' as const, sourceStorageKey: 'videos/parent/lease-clean.mp4', sourceCaptionStorageKey: 'captions/parent/lease.json', sourceUploadUrl: 'https://example.convex.cloud/api/storage/owned', captionStyle: 'clean' as const, captionFont: 'serif' as const,
    sceneReplacement: { index: 1, uploadId: 'upload', plan }, brand: { font: 'mono' as const, captionStyle: 'clean' as const, textColor: '#AABBCC', outlineColor: '#112233' } };
  if (!accepted) { await expect(render(job,new AbortController().signal)).rejects.toThrow('Scene plan lease lost'); expect(replaceSceneVideo).not.toHaveBeenCalled(); return; }
  await render(job,new AbortController().signal);
  expect(saveScenePlan).toHaveBeenCalledWith(job,plan);
  expect(replaceSceneVideo).toHaveBeenCalledWith('/tmp/scene-source.mp4','/tmp/scene-replacement.mp4','/tmp/caption-free.mp4',plan,1,expect.anything());
  expect(mocks.restyle).toHaveBeenCalledWith('/tmp/caption-free.mp4','{"cues":[{"start":0,"end":6,"text":"saved"}]}','clean',expect.anything(),expect.anything(),undefined,'serif');
  expect(onArchive).toHaveBeenCalledWith({videoPath:'/tmp/caption-free.mp4',metadataPath:'/tmp/captions.json',sceneOnly:false});
  const renderCaption = mocks.restyle.mock.calls.at(-1)![4] as typeof mocks.op;
  await renderCaption('/tmp/source.mp4', { op: 'captions', source: 'script', style: 'clean', font: 'serif' }, { tmpDir: '/tmp', isPro: false });
  expect(mocks.op).toHaveBeenLastCalledWith('/tmp/source.mp4', expect.objectContaining({ font: 'serif', colors: expect.objectContaining({ textColor: '#AABBCC' }) }), expect.anything());
  expect(mocks.scene).not.toHaveBeenCalled(); expect(mocks.handle).not.toHaveBeenCalled();
});
test('managed caption operations apply snapshot colors and honor explicit caption font overrides', async () => {
 const { render } = setup();
 await render({ ...base, brand: { font: 'serif', captionStyle: 'clean', textColor: '#12AB34', outlineColor: '#000000' } }, new AbortController().signal);
 const runOp = vi.mocked(createTakeOne).mock.calls.at(-1)![0]!.runOp!;
 await runOp('/tmp/source.mp4', { op: 'captions', source: 'script', style: 'clean', font: 'mono', cues: [{ start: 0, end: 1, text: 'Soap' }] }, { tmpDir: '/tmp', isPro: false });
 expect(mocks.op).toHaveBeenLastCalledWith('/tmp/source.mp4', expect.objectContaining({ font: 'mono', colors: expect.objectContaining({ textColor: '#12AB34' }) }), expect.anything());
 await runOp('/tmp/source.mp4', { op: 'captions', source: 'script', style: 'clean' }, { tmpDir: '/tmp', isPro: false });
 expect(mocks.op).toHaveBeenLastCalledWith('/tmp/source.mp4', expect.objectContaining({ font: 'serif' }), expect.anything());
});
test('invalid snapshot rejects before the managed pipeline starts', async () => {
 const { render } = setup();
 await expect(render({ ...base, brand: { font: 'serif', captionStyle: 'clean', textColor: 'evil', outlineColor: '#000000' } }, new AbortController().signal)).rejects.toThrow('Invalid brand kit');
 expect(mocks.handle).not.toHaveBeenCalled();
});

test('managed output applies the saved logo before delivery validation', async () => {
 const { render } = setup();
 const logo = Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
 const signal = new AbortController().signal;
 await render({ ...base, brand: { font: 'sans', captionStyle: 'clean', textColor: '#FFFFFF', outlineColor: '#000000', logo } }, signal);
 expect(mocks.logo).toHaveBeenCalledExactlyOnceWith('/tmp/render.mp4', logo, '/tmp', signal);
 expect(mocks.delivery).toHaveBeenCalledWith('/tmp/brand.mp4', '/tmp/delivery.mp4', expect.anything(), signal);
});
test('opening hook uses the direct renderer and preserves entitlement without routing', async () => {
 const { render, stages } = setup();
 await render({ ...base, mode: 'edit', sourceStorageKey: 'videos/parent/lease.mp4', hookTitle: 'A different opening' }, new AbortController().signal);
 expect(mocks.op.mock.calls.map((args: unknown[]) => args[1])).toEqual([{ op: 'title', text: 'A different opening', durationSec: 3 }, { op: 'watermark', platform: true, text: 'made with takeone', show: true }]);
 expect(mocks.handle).not.toHaveBeenCalled();
 expect(stages).toEqual(['source', 'finishing', 'checking']);
});
test('archive hook passes immutable title into archive rebuilding', async () => {
 const { render } = setup();
 await render({ ...base, mode: 'edit', sourceStorageKey: 'videos/parent/lease-clean.mp4', sourceCaptionStorageKey: 'captions/parent/lease.json', captionTransform: true, hookTitle: 'An archived opening' }, new AbortController().signal);
 expect(mocks.transform.mock.calls[0]?.[3]).toMatchObject({ hookTitle: 'An archived opening' });
 expect(mocks.handle).not.toHaveBeenCalled();
});

test('speaker crop uses direct worker path and existing free watermark', async () => {
 const { render } = setup();
 await render({ ...base, mode: 'edit', sourceStorageKey: 'videos/parent/lease.mp4', speakerReframe: true }, new AbortController().signal);
 expect(mocks.op.mock.calls.map((args: unknown[]) => args[1])).toEqual([{ op: 'speakerReframe' }, { op: 'watermark', platform: true, text: 'made with takeone', show: true }]);
 expect(mocks.handle).not.toHaveBeenCalled();
});
test('speaker archive keeps caption rebuilding instead of flattened crop', async () => {
 const { render } = setup();
 await render({ ...base, mode: 'edit', sourceStorageKey: 'videos/parent/lease-clean.mp4', sourceCaptionStorageKey: 'captions/parent/lease.json', captionTransform: true, speakerReframe: true }, new AbortController().signal);
 expect(mocks.transform.mock.calls[0]?.[3]).toMatchObject({ speakerReframe: true });
 expect(mocks.handle).not.toHaveBeenCalled();
});
