import { afterEach, describe, it, vi, expect } from 'vitest';
afterEach(() => vi.unstubAllEnvs());
import { renderClaim, youtubeUrl } from './pipeline.js';
import type { ClaimedJob } from './worker.js';
const job: ClaimedJob = { jobId: 'j', userId: 'u', mode: 'clip', aspect: '1:1', prompt: 'https://youtu.be/abc', isPro: false, leaseToken: 'l' };
describe('managed pipeline', () => {
 it('picks one moment per credit, forwards the edit plan and authoritative free entitlement/aspect', async () => {
   const pick = vi.fn(async () => [{ start: '0:10', end: '0:30', hook: 'The hook', reframe: 'fit' as const }]);
   const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
   await renderClaim({ ...job, captionStyle: 'meme' }, new AbortController().signal, { pick, handle, source: vi.fn() });
   expect(pick).toHaveBeenCalledWith({ youtubeUrl: job.prompt }, 1, expect.any(AbortSignal));
   expect(handle).toHaveBeenCalledWith(expect.objectContaining({ captionStyle: 'meme', mode: 'clip', aspect: '1:1', isPro: false, editPlan: expect.objectContaining({ hook: 'The hook', reframe: 'fit' }) }));
 });
 it.each(['0:10 to 0:30', '0:10.125 to 0:30.375', '1.10 to 1.30', '01:00:10.125 to 01:00:30.375'])('preserves explicit range %s without automatic selection', async range => {
   const pick = vi.fn(); const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
   await renderClaim({ ...job, prompt: job.prompt + ' ' + range }, new AbortController().signal, { pick, handle, source: vi.fn() }); expect(pick).not.toHaveBeenCalled();
   expect(handle).toHaveBeenCalledWith(expect.objectContaining({ text: job.prompt + ' ' + range, editPlan: undefined }));
 });
 it('requires exact YouTube hostnames', () => {
   expect(youtubeUrl('https://youtube.com.evil.test/watch?v=abc')).toBeNull();
   expect(youtubeUrl('https://evil.test/youtube.com/watch?v=abc')).toBeNull();
 });
});

it('existing-export edits forward source and suppress new captions', async () => {
 const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
 const source = vi.fn(async () => '/source.mp4');
 await renderClaim({ ...job, mode: 'edit', prompt: 'fit without cropping', sourceStorageKey: 'videos/source/lease.mp4', captionStyle: 'none' }, new AbortController().signal, { source, handle, pick: vi.fn() });
 expect(handle).toHaveBeenCalledWith(expect.objectContaining({ attachmentPath: '/source.mp4', captionStyle: 'none' }));
});

it('forwards structured transforms to the edit gateway unchanged', async () => {
 const transforms = { trim: { start: 1.125, end: 3.875 }, speed: 1.5 as const, aspect: '1:1' as const, fit: 'fit' as const };
 const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
 await renderClaim({ ...job, mode: 'edit', transforms }, new AbortController().signal, { handle, source: async () => '/source.mp4', pick: vi.fn() });
 expect(handle).toHaveBeenCalledWith(expect.objectContaining({ transforms, attachmentPath: '/source.mp4' }));
});

it('clips a stored video without a YouTube link by picking from the stored file and cutting it as an edit', async () => {
 const pick = vi.fn(async () => [{ start: '1:10', end: '1:35', hook: 'The hook' }]);
 const source = vi.fn(async () => '/source.mp4');
 const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
 await renderClaim({ ...job, prompt: 'best moment', sourceStorageKey: 'videos/u/upload.mp4' }, new AbortController().signal, { pick, handle, source });
 expect(pick).toHaveBeenCalledWith({ storageKey: 'videos/u/upload.mp4' }, 1, expect.any(AbortSignal));
 expect(handle).toHaveBeenCalledWith(expect.objectContaining({ mode: 'edit', attachmentPath: '/source.mp4', text: 'trim 1:10 to 1:35 best moment captions', editPlan: expect.objectContaining({ hook: 'The hook' }) }));
});

it('rejects a clip with neither a YouTube link nor a stored video', async () => {
 await expect(renderClaim({ ...job, prompt: 'best moment' }, new AbortController().signal, { pick: vi.fn(), handle: vi.fn(), source: vi.fn() })).rejects.toThrow('YouTube URL or a stored video');
});

const upload = 'https://example.convex.cloud/api/storage/owned';
it('clips an upload by staging it for Gemini, then cutting the staged download as an edit', async () => {
 const stage = vi.fn(async () => ({ path: '/source.mp4', storageKey: 'sources/j.mp4' }));
 const pick = vi.fn(async () => [{ start: '0:05', end: '0:25', hook: 'The hook' }]);
 const source = vi.fn();
 const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
 await renderClaim({ ...job, prompt: 'best moment', sourceUploadUrl: upload }, new AbortController().signal, { pick, handle, source, stage });
 expect(pick).toHaveBeenCalledWith({ storageKey: 'sources/j.mp4' }, 1, expect.any(AbortSignal));
 expect(source).not.toHaveBeenCalled();
 expect(handle).toHaveBeenCalledWith(expect.objectContaining({ mode: 'edit', attachmentPath: '/source.mp4', text: 'trim 0:05 to 0:25 best moment captions', editPlan: expect.objectContaining({ hook: 'The hook' }) }));
});

it('an upload clip with an explicit range neither stages nor picks', async () => {
 const stage = vi.fn(), pick = vi.fn(), source = vi.fn(async () => '/source.mp4');
 const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
 await renderClaim({ ...job, prompt: '0:10 to 0:30', sourceUploadUrl: upload }, new AbortController().signal, { pick, handle, source, stage });
 expect(stage).not.toHaveBeenCalled(); expect(pick).not.toHaveBeenCalled();
 expect(handle).toHaveBeenCalledWith(expect.objectContaining({ mode: 'edit', attachmentPath: '/source.mp4', text: '0:10 to 0:30 captions' }));
});

it('an upload edit keeps the edit path and never stages', async () => {
 const stage = vi.fn(), source = vi.fn(async () => '/source.mp4');
 const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
 await renderClaim({ ...job, mode: 'edit', prompt: 'best moment', sourceUploadUrl: upload }, new AbortController().signal, { pick: vi.fn(), handle, source, stage });
 expect(stage).not.toHaveBeenCalled();
 expect(handle).toHaveBeenCalledWith(expect.objectContaining({ mode: 'edit', text: 'best moment', editPlan: undefined }));
});

describe('edit plans follow configured providers', () => {
  const moment = { start: '0:05', end: '0:20', hook: 'The hook', reframe: 'crop' as const, zooms: [{ at_sec: 6, dur_sec: 1 }], broll: [{ at_sec: 8, dur_sec: 2, keywords: ['flour'] }], gifs: [{ at_sec: 12, dur_sec: 2, query: 'wow' }] };
  const run = async () => {
    const handle = vi.fn(async () => [{ kind: 'file' as const, filePath: '/out.mp4', caption: '' }]);
    await renderClaim({ ...job, prompt: 'best moment', sourceStorageKey: 'videos/u/upload.mp4' }, new AbortController().signal, { pick: vi.fn(async () => [moment]), handle, source: async () => '/source.mp4', stage: vi.fn() });
    return (handle.mock.calls[0] as any)[0].editPlan;
  };
  it('drops cutaways and stickers when no stock or sticker provider is configured', async () => {
    vi.stubEnv('PEXELS_API_KEY', ''); vi.stubEnv('PIXABAY_API_KEY', ''); vi.stubEnv('GIPHY_API_KEY', '');
    expect(await run()).toEqual({ hook: 'The hook', reframe: 'crop', zooms: moment.zooms, broll: undefined, gifs: undefined });
  });
  it('keeps them when the providers are configured', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'k'); vi.stubEnv('GIPHY_API_KEY', 'k');
    expect(await run()).toMatchObject({ broll: moment.broll, gifs: moment.gifs });
  });
  it('reports the gateway reply when no MP4 comes back', async () => {
    const handle = vi.fn(async () => [{ kind: 'text' as const, text: "couldn't finish that: trim end is past the video" }]);
    await expect(renderClaim({ ...job, mode: 'edit', prompt: 'trim 0:01 to 0:02' }, new AbortController().signal, { pick: vi.fn(), handle, source: async () => '/source.mp4', stage: vi.fn() }))
      .rejects.toThrow("Pipeline did not produce one MP4: couldn't finish that: trim end is past the video");
  });
});
