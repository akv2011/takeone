import { beforeEach, expect, test, vi } from 'vitest';
import { prepare } from './app.js';
import type { JobSpec, Op } from './types.js';
const mocks = vi.hoisted(() => ({
  transcribe: vi.fn(async () => ({ words: [{ text: 'hello', start: 0, end: 1 }] })),
  op: vi.fn(async () => ({ outputPath: '/tmp/media.mp4' })),
}));
vi.mock('./media/index.js', () => ({ mediaCore: { runOp: mocks.op } }));
vi.mock('./media/ffmpeg.js', () => ({ ff: vi.fn(), ffprobe: vi.fn(async () => ({ durationSec: 1 })) }));
vi.mock('./content/scenes.js', () => ({ planStockScenes: vi.fn(async () => ({})) }));
vi.mock('./media/scenes.js', () => ({ renderStockScenes: vi.fn(async () => '/tmp/scenes.mp4') }));
vi.mock('./search/index.js', () => ({ search: vi.fn(async () => ({ facts: [] })) }));
vi.mock('./content/index.js', () => ({ content: { brainstorm: vi.fn(async () => ['angle']), script: vi.fn(async () => ({ script: 'hello' })), captionText: vi.fn(async () => 'hello') } }));
vi.mock('./transcribe/index.js', () => ({ transcriber: { transcribe: mocks.transcribe } }));
vi.mock('./ingest/index.js', () => ({ ingest: { ingest: vi.fn(async () => ({ path: '/tmp/source.mp4', meta: { durationSec: 1, width: 100, height: 200 } })) } }));
beforeEach(() => vi.clearAllMocks());
test.each([false, true])('actual generate prepare omits transcription when captions disabled (%s)', async captions => {
  const stages: string[] = [];
  const job = { mode: 'generate', source: { kind: 'none', topic: 'soap' }, ops: captions ? [{ op: 'captions', source: 'script', style: 'clean' }] : [] } as JobSpec;
  await prepare(job, { tmpDir: '/tmp', isPro: true, strictMedia: true, onRenderStage: async stage => { stages.push(stage); } });
  expect(stages).toEqual(['script', 'narration', 'footage', ...(captions ? ['transcription'] : [])]);
  expect(mocks.transcribe).toHaveBeenCalledTimes(captions ? 1 : 0);
});
test.each(['edit', 'clip'] as const)('actual %s prepare loads source and only transcribes a requested caption operation', async mode => {
  for (const captions of [false, true]) {
    mocks.transcribe.mockClear();
    const stages: string[] = [];
    await prepare({ mode, source: { kind: 'upload', path: '/tmp/source.mp4' }, ops: captions ? [{ op: 'captions', source: 'whisper', style: 'clean' }] as Op[] : [] } as JobSpec,
      { tmpDir: '/tmp', isPro: true, strictMedia: true, onRenderStage: async stage => { stages.push(stage); } });
    expect(stages).toEqual(['source', ...(captions ? ['transcription'] : [])]);
    expect(mocks.transcribe).toHaveBeenCalledTimes(captions ? 1 : 0);
  }
});
