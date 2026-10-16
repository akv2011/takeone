// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { extractVideoFrames } from '../src/lib/videoFrames';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function media() {
 const create = document.createElement.bind(document);
 const video = create('video'); const canvas = create('canvas');
 const load = vi.spyOn(video, 'load').mockImplementation(() => {});
 const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
 vi.spyOn(document, 'createElement').mockImplementation(((name: string) => name === 'video' ? video : name === 'canvas' ? canvas : create(name)) as typeof document.createElement);
 return { video, canvas, load, pause };
}
test('cancellation during metadata loading releases decoder and canvas', async () => {
 const f = media(), controller = new AbortController();
 const pending = extractVideoFrames('https://test/video', controller.signal);
 expect(f.video.src).toBe('https://test/video'); controller.abort();
 await expect(pending).rejects.toThrow();
 expect(f.pause).toHaveBeenCalledOnce(); expect(f.video.hasAttribute('src')).toBe(false);
 expect(f.load).toHaveBeenCalledTimes(2); expect(f.canvas.width).toBe(0);
});
test('stalled metadata times out and releases resources', async () => {
 vi.useFakeTimers(); const f = media();
 const pending = extractVideoFrames('https://test/video', new AbortController().signal);
 const rejected = expect(pending).rejects.toThrow('Frame preview unavailable');
 await vi.advanceTimersByTimeAsync(10_000); await rejected;
 expect(f.video.hasAttribute('src')).toBe(false); expect(f.pause).toHaveBeenCalledOnce();
 expect(vi.getTimerCount()).toBe(0);
});
test('pre-cancelled extraction does not create a decoder', async () => {
 const create = vi.spyOn(document, 'createElement'); const controller = new AbortController(); controller.abort();
 await expect(extractVideoFrames('https://test/video', controller.signal)).rejects.toThrow();
 expect(create).not.toHaveBeenCalled();
});
