// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useTimelinePlayer } from '../src/hooks/useTimelinePlayer';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
test('animation updates stop at the selected boundary and restore speed without a timeupdate event', () => {
 let next: FrameRequestCallback | undefined;
 vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { next = callback; return 1; });
 const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
 const video = { currentTime: 0, playbackRate: 1, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() } as unknown as HTMLVideoElement;
 const onTime = vi.fn();
 const { result } = renderHook(() => useTimelinePlayer({ current: video }, 'source', onTime));
 result.current.preview(2.125, 7.875, 2);
 video.currentTime = 7.9;
 next!(100);
 expect(video.currentTime).toBe(7.875); expect(video.playbackRate).toBe(1);
 expect(video.pause).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalled();
 expect(onTime).toHaveBeenLastCalledWith(7.875);
});
test('a late play rejection cannot reset a newer preview and unmount cancels its loop', async () => {
 let rejectFirst!: (reason: Error) => void;
 const first = new Promise<void>((_, reject) => { rejectFirst = reject; });
 vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(12);
 const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
 const video = { currentTime: 0, playbackRate: 1, play: vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined), pause: vi.fn() } as unknown as HTMLVideoElement;
 const ref = { current: video };
 const { result, unmount } = renderHook(() => useTimelinePlayer(ref, 'source', vi.fn()));
 result.current.preview(0, 5, 2);
 result.current.preview(1, 6, 1.5);
 rejectFirst(new Error('old interrupted playback')); await first.catch(() => {});
 expect(video.playbackRate).toBe(1.5);
 unmount();
 expect(cancel).toHaveBeenCalledWith(12); expect(video.playbackRate).toBe(1);
});
