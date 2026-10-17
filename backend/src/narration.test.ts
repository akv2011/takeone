import { describe, it, expect, vi } from 'vitest';
vi.mock('./search/index.js', () => ({ search: vi.fn(async () => ({ facts: [] })) }));
vi.mock('./content/index.js', () => ({ content: { brainstorm: vi.fn(async () => [{}]), script: vi.fn(async () => ({ script: 'one two three four' })) } }));
vi.mock('./media/index.js', () => ({ mediaCore: { runOp: vi.fn(async (_input, op) => ({ outputPath: op.op === 'voiceover' ? '/voice.m4a' : '/broll.mp4' })) } }));
vi.mock('./media/ffmpeg.js', () => ({ ff: vi.fn(async () => {}), ffprobe: vi.fn(async () => ({ durationSec: 42 })) }));
vi.mock('./content/scenes.js', () => ({ planStockScenes: vi.fn(async () => ({ version: 1 })) }));
vi.mock('./media/scenes.js', () => ({ renderStockScenes: vi.fn(async () => '/scenes.mp4') }));
import { planStockScenes } from './content/scenes.js';
import { renderStockScenes } from './media/scenes.js';
import { prepare } from './app.js';
import { ff } from './media/ffmpeg.js';
import { mediaCore } from './media/index.js';
import { content } from './content/index.js';
import { transcriber } from './transcribe/index.js';
import { DEFAULT_LIMITS, type JobSpec } from './types.js';
describe('narration duration', () => {
 it('retains the full 42 second narration even when b-roll is shorter', async () => {
  const job: JobSpec = { id: '1', userId: 'u', mode: 'generate', platform: 'cli', source: { kind: 'none', topic: 'topic' }, isPro: false, limits: DEFAULT_LIMITS, ops: [{ op: 'captions', source: 'script', style: 'karaoke' }] };
  const result = await prepare(job, { tmpDir: '/tmp/test', isPro: false });
  expect(mediaCore.runOp).toHaveBeenCalledWith('', expect.objectContaining({ op: 'broll', durationSec: 42 }), expect.anything());
  const args = vi.mocked(ff).mock.calls[0][0];
  expect(args.slice(0, 4)).toEqual(['-stream_loop', '-1', '-i', '/broll.mp4']);
  expect(args).toContain('-t'); expect(args[args.indexOf('-t') + 1]).toBe('42'); expect(args).not.toContain('-shortest');
  expect(result.ops[0]).toMatchObject({ cues: expect.arrayContaining([expect.objectContaining({ end: 42 })]) });
 });
});

vi.mock('./transcribe/index.js', () => ({ transcriber: { transcribe: vi.fn(async () => ({ srt: '', words: [{ text: 'spoken', start: 2, end: 3.4 }, { text: 'slowly', start: 8, end: 9 }] })) } }));
it('strict generation captions use actual spoken timestamps instead of distributing the script uniformly', async () => {
  const job: JobSpec = { id: 'strict', userId: 'u', mode: 'generate', platform: 'cli', source: { kind: 'none', topic: 'topic' }, isPro: true, limits: DEFAULT_LIMITS, ops: [{ op: 'captions', source: 'script', style: 'clean' }] };
  const controller = new AbortController();
  const result = await prepare(job, { tmpDir: '/tmp/test', isPro: true, strictMedia: true, signal: controller.signal });
  expect(transcriber.transcribe).toHaveBeenLastCalledWith('/voice.m4a', controller.signal);
  expect(content.brainstorm).toHaveBeenLastCalledWith('topic', [], expect.objectContaining({ strict: true }));
  expect(content.script).toHaveBeenLastCalledWith({}, [], expect.objectContaining({ strict: true }));
  expect(result.ops[0]).toMatchObject({ cues: [{ start: 2, end: 3.4, text: 'spoken' }, { start: 8, end: 9, text: 'slowly' }] });
});

it('no-caption generation skips transcription while retaining narration', async () => {
 const job: JobSpec = { id: 'no-captions', userId: 'u', mode: 'generate', platform: 'cli', source: { kind: 'none', topic: 'topic' }, isPro: true, limits: DEFAULT_LIMITS, ops: [] };
 vi.mocked(transcriber.transcribe).mockClear();
 const result = await prepare(job, { tmpDir: '/tmp/test', isPro: true, strictMedia: true });
 expect(result.ops).toEqual([]);
 expect(transcriber.transcribe).not.toHaveBeenCalled();
 expect(mediaCore.runOp).toHaveBeenCalledWith('', expect.objectContaining({ op: 'voiceover' }), expect.anything());
});
it('bold generated captions use uppercase spoken words', async () => {
 const job: JobSpec = { id: 'bold', userId: 'u', mode: 'generate', platform: 'cli', source: { kind: 'none', topic: 'topic' }, isPro: true, limits: DEFAULT_LIMITS, ops: [{ op: 'captions', source: 'script', style: 'meme' }] };
 const result = await prepare(job, { tmpDir: '/tmp/test', isPro: true, strictMedia: true });
 expect(result.ops[0]).toMatchObject({ cues: [{ start: 2, end: 3.4, text: 'SPOKEN' }, { start: 8, end: 9, text: 'SLOWLY' }] });
});

it('production generation uses a timed plan instead of a looping keyword clip', async () => {
 vi.mocked(ff).mockClear(); vi.mocked(mediaCore.runOp).mockClear();
 const job: JobSpec = { id: 'plan', userId: 'u', mode: 'generate', platform: 'cli', source: { kind: 'none', topic: 'Founder launching a SaaS product' }, isPro: true, limits: DEFAULT_LIMITS, ops: [] };
 await prepare(job, { tmpDir: '/tmp/test', isPro: true, strictMedia: true });
 expect(planStockScenes).toHaveBeenLastCalledWith(job.source.topic, 'one two three four', 42, expect.objectContaining({ strict: true }));
 expect(renderStockScenes).toHaveBeenCalled();
 expect(vi.mocked(mediaCore.runOp).mock.calls.some(([, op]) => op.op === 'broll')).toBe(false);
 expect(vi.mocked(ff).mock.calls[0][0].slice(0, 2)).toEqual(['-i', '/scenes.mp4']);
 expect(vi.mocked(ff).mock.calls[0][0]).not.toContain('-stream_loop');
});

const savedPlan = () => ({ version: 1 as const, brief: { audience: 'buyers', promise: 'soap', visualNouns: ['soap'], setting: 'bathroom', lighting: 'day', cameraMotion: 'still', pacing: 'calm', restrictedTerms: [] }, scenes: [
 { startSec: 0, endSec: 21, purpose: 'Texture', searchTerms: ['soap macro'], shotType: 'macro', motion: 'still' },
 { startSec: 21, endSec: 42, purpose: 'Use', searchTerms: ['washing hands'], shotType: 'close up', motion: 'pan' },
] });
it('awaits safe plan persistence before footage starts and maps output timing', async () => {
 vi.mocked(planStockScenes).mockResolvedValueOnce(savedPlan()); vi.mocked(renderStockScenes).mockClear();
 const job: JobSpec = { id: 'saved', userId: 'u', mode: 'generate', platform: 'cli', source: { kind: 'none', topic: 'Soap' }, isPro: true, limits: DEFAULT_LIMITS, ops: [{ op: 'trim', start: '20', end: '24' }, { op: 'speed', factor: 2 }] };
 let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
 let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
 const onScenePlan = vi.fn(async () => { began(); await gate; });
 const pending = prepare(job, { tmpDir: '/tmp/test', isPro: true, strictMedia: true, onScenePlan });
 await started;
 expect(renderStockScenes).not.toHaveBeenCalled();
 expect(onScenePlan).toHaveBeenCalledWith({ version: 1, durationSec: 2, scenes: [
  { ...savedPlan().scenes[0], startSec: 0, endSec: 0.5 }, { ...savedPlan().scenes[1], startSec: 0.5, endSec: 2 },
 ] });
 release(); await pending;
 expect(renderStockScenes).toHaveBeenCalledWith(savedPlan(), 42, expect.anything(), '9:16');
});
it.each(['reject', 'abort'])('does not render after plan persistence %s', async mode => {
 vi.mocked(planStockScenes).mockResolvedValueOnce(savedPlan()); vi.mocked(renderStockScenes).mockClear();
 const controller = new AbortController();
 const job: JobSpec = { id: 'lost', userId: 'u', mode: 'generate', platform: 'cli', source: { kind: 'none', topic: 'Soap' }, isPro: true, limits: DEFAULT_LIMITS, ops: [] };
 const onScenePlan = async () => { if (mode === 'reject') throw Error('lease lost'); controller.abort(Error('lease lost')); };
 await expect(prepare(job, { tmpDir: '/tmp/test', isPro: true, strictMedia: true, signal: controller.signal, onScenePlan })).rejects.toThrow('lease lost');
 expect(renderStockScenes).not.toHaveBeenCalled();
});
it('executor options carry the persistence hook to production prepare', async () => {
 vi.mocked(planStockScenes).mockResolvedValueOnce(savedPlan()); vi.mocked(renderStockScenes).mockClear();
 const onScenePlan = vi.fn(async () => { throw Error('persistence unavailable'); });
 const { createTakeOne } = await import('./app.js');
 const app = createTakeOne({ executor: { strictMedia: true, onScenePlan }, data: { isPro: async () => true, freeUsedToday: async () => 0, incUsage: async () => 0 } });
 await app.handle({ userId: 'persist-hook', platform: 'cli', text: 'A story about soap', isPro: true });
 expect(onScenePlan).toHaveBeenCalledWith(expect.objectContaining({ durationSec: 42 }));
 expect(renderStockScenes).not.toHaveBeenCalled();
});
