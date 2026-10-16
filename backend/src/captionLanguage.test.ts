import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./search/index.js', () => ({ search: vi.fn(async () => ({ facts: [] })) }));
vi.mock('./content/index.js', async original => {
  const { content } = await original<typeof import('./content/index.js')>();
  return { content: { ...content, brainstorm: vi.fn(async () => [{ hook: 'h', premise: 'p', whyViral: 'w' }]), script: vi.fn(async () => ({ script: 'one two three four', captions: '' })) } };
});
vi.mock('./media/index.js', () => ({ mediaCore: { runOp: vi.fn(async (_input, op) => ({ outputPath: op.op === 'voiceover' ? '/voice.m4a' : '/broll.mp4' })) } }));
vi.mock('./media/ffmpeg.js', () => ({ ff: vi.fn(async () => {}), ffprobe: vi.fn(async () => ({ durationSec: 42 })) }));
vi.mock('./content/scenes.js', () => ({ planStockScenes: vi.fn(async () => ({ version: 1, brief: {}, scenes: [{ startSec: 0, endSec: 42, purpose: 'p', searchTerms: ['soap'], shotType: 'wide', motion: 'still' }] })) }));
vi.mock('./media/scenes.js', () => ({ renderStockScenes: vi.fn(async () => '/scenes.mp4') }));
vi.mock('./transcribe/index.js', () => ({ transcriber: { transcribe: vi.fn() } }));
vi.mock('./ingest/index.js', () => ({ ingest: { ingest: vi.fn(async () => ({ path: '/source.mp4', meta: { durationSec: 10, width: 1080, height: 1920, hasAudio: true, hasVideo: true, bytes: 1 } })) } }));
vi.mock('./google/translate.js', () => ({ translateCues: vi.fn() }));
import { prepare } from './app.js';
import { content } from './content/index.js';
import { planStockScenes } from './content/scenes.js';
import { translateCues } from './google/translate.js';
import { mediaCore } from './media/index.js';
import { transcriber } from './transcribe/index.js';
import { DEFAULT_LIMITS, type JobCtx, type JobSpec } from './types.js';

const words = [{ text: 'hello', start: 0, end: 0.5 }, { text: 'brave', start: 0.5, end: 1 }, { text: 'new', start: 1, end: 1.5 }, { text: 'world', start: 1.5, end: 2 }];
const cues = [{ start: 0, end: 1.5, text: 'hello brave new' }, { start: 1.5, end: 2, text: 'world' }];
const editJob = (style: 'clean' | 'meme' = 'clean'): JobSpec => ({ id: 'e', userId: 'u', mode: 'edit', platform: 'cli', source: { kind: 'upload', path: '/upload.mp4' }, isPro: true, limits: DEFAULT_LIMITS, ops: [{ op: 'captions', source: 'whisper', style }] });
const strict: JobCtx = { tmpDir: '/tmp/test', isPro: true, strictMedia: true };
const heard = (language?: string) => vi.mocked(transcriber.transcribe).mockResolvedValue({ srt: '', words, ...(language ? { language } : {}) });
const translatesTo = (texts: string[]) => vi.mocked(translateCues).mockImplementationOnce(async input => input.map((cue, i) => ({ ...cue, text: texts[i] })));
beforeEach(() => vi.clearAllMocks());

it('translates edit captions when the detected language differs and keeps each cue timing', async () => {
  heard('en-us'); translatesTo(['你好勇敢的新', '世界']);
  const signal = new AbortController().signal;
  const { ops } = await prepare(editJob(), { ...strict, signal, captionLanguage: 'zh' });
  expect(translateCues).toHaveBeenCalledExactlyOnceWith(cues, 'zh-CN', signal);
  expect(ops).toEqual([{ op: 'captions', source: 'whisper', style: 'clean', text: '你好勇敢的新世界', cues: [{ start: 0, end: 1.5, text: '你好勇敢的新' }, { start: 1.5, end: 2, text: '世界' }] }]);
});

it('translates when Speech-to-Text reports no language', async () => {
  heard(); translatesTo(['नमस्ते बहादुर नई', 'दुनिया']);
  const { ops } = await prepare(editJob(), { ...strict, captionLanguage: 'hi' });
  expect(translateCues).toHaveBeenCalledExactlyOnceWith(cues, 'hi', undefined);
  expect(ops[0]).toMatchObject({ text: 'नमस्ते बहादुर नई दुनिया' });
});

it('uppercases translated meme captions', async () => {
  heard('en-us'); translatesTo(['halo berani baru', 'dunia']);
  const { ops } = await prepare(editJob('meme'), { ...strict, captionLanguage: 'id' });
  expect(ops).toEqual([{ op: 'captions', source: 'whisper', style: 'meme', text: 'HALO BERANI BARU DUNIA', cues: [{ start: 0, end: 1.5, text: 'HALO BERANI BARU' }, { start: 1.5, end: 2, text: 'DUNIA' }] }]);
});

it.each([['en-US', 'en'], ['cmn-Hans-CN', 'zh']] as const)('keeps %s captions untranslated for %s', async (detected, captionLanguage) => {
  heard(detected);
  const { ops } = await prepare(editJob(), { ...strict, captionLanguage });
  expect(translateCues).not.toHaveBeenCalled();
  expect(ops).toEqual([{ op: 'captions', source: 'whisper', style: 'clean', text: 'hello brave new world', cues }]);
});

it.each(['clean', 'meme'] as const)('never translates %s captions without a caption language', async style => {
  heard('hi-in');
  const { ops } = await prepare(editJob(style), strict);
  expect(translateCues).not.toHaveBeenCalled();
  const upper = (text: string) => style === 'meme' ? text.toUpperCase() : text;
  expect(ops).toEqual([{ op: 'captions', source: 'whisper', style, text: upper('hello brave new world'), cues: cues.map(cue => ({ ...cue, text: upper(cue.text) })) }]);
});

it('a translation failure fails strict captions and leaves the offline placeholder', async () => {
  heard('en-us');
  const denied = Error('Cloud Translation rejected the request (403)');
  vi.mocked(translateCues).mockRejectedValueOnce(denied).mockRejectedValueOnce(denied);
  await expect(prepare(editJob(), { ...strict, captionLanguage: 'ta' })).rejects.toThrow('(403)');
  expect((await prepare(editJob(), { tmpDir: '/tmp/test', isPro: true, captionLanguage: 'ta' })).ops).toEqual(editJob().ops);
});

it('generated videos pass the caption language to the script, the stock plan and the narration', async () => {
  const job: JobSpec = { id: 'g', userId: 'u', mode: 'generate', platform: 'cli', source: { kind: 'none', topic: 'soap' }, isPro: true, limits: DEFAULT_LIMITS, ops: [] };
  await prepare(job, { ...strict, captionLanguage: 'hi' });
  expect(content.script).toHaveBeenLastCalledWith(expect.anything(), [], expect.objectContaining({ strict: true, language: 'hi' }));
  expect(planStockScenes).toHaveBeenLastCalledWith('soap', 'one two three four', 42, expect.objectContaining({ strict: true, language: 'hi' }));
  expect(mediaCore.runOp).toHaveBeenCalledWith('', { op: 'voiceover', script: 'one two three four' }, expect.objectContaining({ captionLanguage: 'hi' }));
  await prepare(job, strict);
  expect(vi.mocked(content.script).mock.lastCall![2]!.language).toBeUndefined();
  expect(vi.mocked(planStockScenes).mock.lastCall![3]!.language).toBeUndefined();
});
