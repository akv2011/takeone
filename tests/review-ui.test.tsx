// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
const mocks = vi.hoisted(() => ({ data: null as any, links: [] as any[], notes: [] as any[], sign: vi.fn(), create: vi.fn(), mutate: vi.fn() }));
vi.mock('convex/react', () => ({
 useQuery: (ref: Parameters<typeof getFunctionName>[0], args: any) => {
  if (args === 'skip') return undefined;
  const name = getFunctionName(ref);
  return name === 'reviews:get' ? mocks.data : name === 'reviews:list' ? mocks.links : mocks.notes;
 },
 useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === 'reviews:create' ? mocks.create : mocks.sign,
 useMutation: () => mocks.mutate,
}));
import { ReviewContent } from '../src/pages/Review';
import { ShareReview } from '../src/components/ShareReview';
const token = 'a'.repeat(64);
beforeEach(() => {
 mocks.data = { durationSec: 10, expiresAt: Date.now() + 60_000, comments: [{ id: 'note1', name: 'Guest', at: 2.875, text: 'Trim this shot', resolved: false, createdAt: 1 }] };
 mocks.links = []; mocks.notes = [];
 mocks.sign.mockReset().mockResolvedValue({ url: 'https://storage.test/video.mp4', expiresAt: Date.now() + 120_000 });
 mocks.create.mockReset().mockResolvedValue({ id: 'review1', token, expiresAt: Date.now() + 86400000 });
 mocks.mutate.mockReset().mockResolvedValue('note');
 vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
test('loads the public video, seeks to feedback and submits a playhead note without any job or storage argument', async () => {
 const view = render(<ReviewContent token={token} />);
 await act(async () => {});
 const video = view.container.querySelector('video')!;
 Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
 fireEvent.loadedMetadata(video);
 fireEvent.click(screen.getByRole('button', { name: 'Seek to 00:02.875' }));
 expect(video.currentTime).toBe(2.875); expect(video.pause).toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Use playhead' }));
 fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mira' } });
 fireEvent.change(screen.getByLabelText('Your note'), { target: { value: 'Tighten this cut' } });
 await act(async () => fireEvent.submit(view.container.querySelector('form')!));
 expect(mocks.mutate).toHaveBeenCalledWith({ token, name: 'Mira', text: 'Tighten this cut', at: 2.875, requestId: expect.any(String) });
 expect(mocks.sign).toHaveBeenCalledWith({ token });
});
test('an uncertain comment response retries the same identity and preserves text until saved', async () => {
 mocks.mutate.mockRejectedValueOnce(Error('network'));
 const view = render(<ReviewContent token={token} />); await act(async () => {});
 fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Guest' } });
 fireEvent.change(screen.getByLabelText('Your note'), { target: { value: 'Keep this' } });
 await act(async () => fireEvent.submit(view.container.querySelector('form')!));
 expect((screen.getByLabelText('Your note') as HTMLTextAreaElement).value).toBe('Keep this');
 await act(async () => fireEvent.submit(view.container.querySelector('form')!));
 expect(mocks.mutate.mock.calls[0][0].requestId).toBe(mocks.mutate.mock.calls[1][0].requestId);
 expect((screen.getByLabelText('Your note') as HTMLTextAreaElement).value).toBe('');
});
test('revocation removes the video and stale signing responses cannot reopen it', async () => {
 let resolve!: (value: unknown) => void;
 mocks.sign.mockReturnValue(new Promise(done => { resolve = done; }));
 const view = render(<ReviewContent token={token} />);
 mocks.data = null; view.rerender(<ReviewContent token={token} />);
 await act(async () => resolve({ url: 'https://storage.test/video.mp4', expiresAt: Date.now() + 120000 }));
 expect(screen.getByText('Review unavailable')).toBeTruthy();
 expect(view.container.querySelector('video')).toBeNull();
});
test('expiry closes access without waiting for a reactive database write', async () => {
 vi.useFakeTimers();
 mocks.data.expiresAt = Date.now() + 1000;
 const view = render(<ReviewContent token={token} />); await act(async () => {});
 act(() => vi.advanceTimersByTime(1001));
 expect(screen.getByText('Review unavailable')).toBeTruthy(); expect(view.container.querySelector('form')).toBeNull();
});
test('share creation is explicit, supports revocation, and stale owner responses stay in their originating view', async () => {
 let resolve!: (value: unknown) => void;
 mocks.create.mockReturnValueOnce(new Promise(done => { resolve = done; }));
 const view = render(<ShareReview key="job1" jobId="job1" duration={10} onSeek={() => {}} />);
 expect(mocks.create).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Share for review' }));
 expect(mocks.create).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Create review link' }));
 expect(mocks.create).toHaveBeenCalledWith({ jobId: 'job1', durationSec: 10, days: 7 });
 view.rerender(<ShareReview key="job2" jobId="job2" duration={10} onSeek={() => {}} />);
 await act(async () => resolve({ id: 'old', token }));
 expect(screen.queryByDisplayValue(new RegExp(token))).toBeNull();
 mocks.links = [{ id: 'review2', createdAt: Date.now(), expiresAt: Date.now() + 100000, commentCount: 1 }];
 mocks.notes = mocks.data.comments;
 fireEvent.click(screen.getByRole('button', { name: 'Share for review' }));
 await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Revoke review link' })));
 expect(mocks.mutate).toHaveBeenCalledWith({ reviewId: 'review2' });
});
test('playback refresh restores the current position when the new URL loads', async () => {
 const view = render(<ReviewContent token={token} />); await act(async () => {});
 const video = view.container.querySelector('video')!;
 Object.defineProperty(video, 'duration', { value: 10, configurable: true });
 video.currentTime = 4.125;
 mocks.sign.mockResolvedValueOnce({ url: 'https://storage.test/new.mp4', expiresAt: Date.now() + 120000 });
 await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh playback' })));
 video.currentTime = 0; fireEvent.loadedMetadata(video);
 expect(video.currentTime).toBe(4.125);
});
