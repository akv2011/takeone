import { describe, it, vi, expect } from 'vitest';
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
