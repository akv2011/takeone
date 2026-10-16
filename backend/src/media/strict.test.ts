import { afterEach, expect, test, vi } from 'vitest';
vi.mock('./gifs.js', () => ({ fetchSticker: vi.fn(async () => null) }));
vi.mock('./broll.js', () => ({ fetchStockBroll: vi.fn(async () => null) }));
vi.mock('./ffmpeg.js', () => ({ ff: vi.fn(), ffprobe: vi.fn(async () => ({ hasVideo: true, hasAudio: true, durationSec: 20, width: 720, height: 1280 })), hasFilter: vi.fn(async () => true), fontFile: vi.fn() }));
import { mediaCore } from './index.js';
import { ff } from './ffmpeg.js';
import { fetchSticker } from './gifs.js';
import { fetchStockBroll } from './broll.js';
import { runWorker } from '../managed/worker.js';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const ctx = { tmpDir: '/tmp/strict-test', isPro: true, strictMedia: true };
test('production does not fabricate stock footage when the provider fails', async () => {
  await expect(mediaCore.runOp('', { op: 'broll', keywords: ['city'] }, ctx)).rejects.toThrow('Stock footage');
  expect(ff).not.toHaveBeenCalled();
});
test('production does not silently substitute system speech for missing provider voice', async () => {
  vi.stubEnv('TTS_API_KEY', ''); vi.stubEnv('ELEVENLABS_API_KEY', '');
  await expect(mediaCore.runOp('', { op: 'voiceover', script: 'The requested voice', voiceId: '' }, ctx)).rejects.toThrow('Voice provider');
  expect(ff).not.toHaveBeenCalled();
});
test('production does not render a blank caption bar as successful captions', async () => {
  await expect(mediaCore.runOp('/source.mp4', { op: 'captions', source: 'whisper', style: 'clean' }, ctx)).rejects.toThrow('Captions require');
  expect(ff).not.toHaveBeenCalled();
});

const windows = [{ at: 2, dur: 2, keywords: ['city'] }, { at: 6, dur: 2, keywords: ['park'] }];
test('production rejects missing cutaways without copying the unchanged source', async () => {
 await expect(mediaCore.runOp('/source.mp4', { op: 'cutaways', segments: windows }, ctx)).rejects.toThrow('Stock footage unavailable');
 expect(ff).not.toHaveBeenCalled();
});
test('production rejects partially fulfilled cutaway requests', async () => {
 vi.mocked(fetchStockBroll).mockResolvedValueOnce('/city.mp4').mockResolvedValueOnce(null);
 await expect(mediaCore.runOp('/source.mp4', { op: 'cutaways', segments: windows }, ctx)).rejects.toThrow('Stock footage unavailable');
 expect(ff).not.toHaveBeenCalled();
});
test('available cutaways retain their original audio mapping', async () => {
 vi.mocked(fetchStockBroll).mockResolvedValueOnce('/city.mp4').mockResolvedValueOnce('/park.mp4');
 await mediaCore.runOp('/source.mp4', { op: 'cutaways', segments: windows }, ctx);
 const args = vi.mocked(ff).mock.calls[0][0];
 expect(args).toContain('/city.mp4'); expect(args).toContain('/park.mp4'); expect(args).toContain('0:a');
});
test('explicit offline cutaway mode still permits a passthrough', async () => {
 await mediaCore.runOp('/source.mp4', { op: 'cutaways', segments: windows }, { ...ctx, strictMedia: false });
 expect(ff).toHaveBeenCalledOnce(); expect(vi.mocked(ff).mock.calls[0][0]).toContain('copy');
});
test('production rejects an empty effective cutaway selection', async () => {
 await expect(mediaCore.runOp('/source.mp4', { op: 'cutaways', segments: [] }, ctx)).rejects.toThrow('Stock footage unavailable');
 expect(fetchStockBroll).not.toHaveBeenCalled(); expect(ff).not.toHaveBeenCalled();
});
test('missing cutaways reach durable failure handling and never upload or complete', async () => {
 const job = { jobId: 'job1', userId: 'user1', mode: 'edit' as const, prompt: 'Add city cutaways', aspect: '9:16' as const, isPro: true, leaseToken: 'lease1' };
 const fail = vi.fn(async () => true), upload = vi.fn(), complete = vi.fn(), cleanup = vi.fn();
 const outcome = await runWorker('job1', { claim: async () => job, heartbeat: async () => true,
  render: async (_job, signal) => (await mediaCore.runOp('/source.mp4', { op: 'cutaways', segments: windows }, { ...ctx, signal })).outputPath,
  inspect: async () => ({ mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true }),
  upload, complete, fail, cleanup, deliver: vi.fn(), log: vi.fn() });
 expect(outcome).toBe('failed'); expect(fail).toHaveBeenCalledOnce(); expect(cleanup).toHaveBeenCalledOnce();
 expect(upload).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
});

const stickers = [{ at: 2, dur: 3, query: 'wow' }];
test('production missing stickers fail instead of copying the original', async () => {
 await expect(mediaCore.runOp('/source.mp4', { op: 'gifs', items: stickers }, ctx)).rejects.toThrow('Sticker footage unavailable');
 expect(ff).not.toHaveBeenCalled();
});
test('available stickers receive cancellation and preserve source audio mapping', async () => {
 vi.mocked(fetchSticker).mockResolvedValueOnce('/sticker.gif');
 const signal = new AbortController().signal;
 await mediaCore.runOp('/source.mp4', { op: 'gifs', items: stickers }, { ...ctx, signal });
 expect(fetchSticker).toHaveBeenCalledWith('wow', signal);
 expect(vi.mocked(ff).mock.calls[0][0]).toContain('0:a');
 expect(vi.mocked(ff).mock.calls[0][0]).toContain('/sticker.gif');
});
test('offline sticker fallback stays explicit', async () => {
 await mediaCore.runOp('/source.mp4', { op: 'gifs', items: stickers }, { ...ctx, strictMedia: false });
 expect(vi.mocked(ff).mock.calls[0][0]).toContain('copy');
});
test('empty production sticker selections cannot complete an unchanged edit', async () => {
 await expect(mediaCore.runOp('/source.mp4', { op: 'gifs', items: [] }, ctx)).rejects.toThrow('Sticker footage unavailable');
 expect(fetchSticker).not.toHaveBeenCalled(); expect(ff).not.toHaveBeenCalled();
});
