// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
const mocks = vi.hoisted(() => ({ data: null as any, links: [] as any[], notes: [] as any[], summary: null as any, sign: vi.fn(), create: vi.fn(), summarize: vi.fn(), mutate: vi.fn() }));
vi.mock('convex/react', () => ({
 useQuery: (ref: Parameters<typeof getFunctionName>[0], args: any) => {
  if (args === 'skip') return undefined;
  const name = getFunctionName(ref);
  return name === 'reviews:get' ? mocks.data : name === 'reviews:list' ? mocks.links : name === 'reviews:summary' ? mocks.summary : mocks.notes;
 },
 useAction: (ref: Parameters<typeof getFunctionName>[0]) => ({ 'reviews:create': mocks.create, 'reviews:summarize': mocks.summarize })[getFunctionName(ref)] ?? mocks.sign,
 useMutation: () => mocks.mutate,
}));
import { ReviewContent } from '../src/pages/Review';
import { ShareReview } from '../src/components/ShareReview';
const token = 'a'.repeat(64);
beforeEach(() => {
 mocks.data = { durationSec: 10, expiresAt: Date.now() + 60_000, comments: [{ id: 'note1', name: 'Guest', at: 2.875, text: 'Trim this shot', resolved: false, createdAt: 1 }] };
 mocks.links = []; mocks.notes = []; mocks.summary = null;
 mocks.summarize.mockReset().mockResolvedValue(null);
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
const openShare = (props: { duration?: number; onSeek?(at: number): void } = {}) => {
 const view = render(<ShareReview jobId="job1" duration={'duration' in props ? props.duration : 10} onSeek={props.onSeek ?? (() => {})} />);
 fireEvent.click(screen.getByRole('button', { name: 'Share for review' }));
 return view;
};
test('summarizing needs 3 notes across the version and then calls summarize for the version', async () => {
 mocks.links = [{ id: 'review1', createdAt: 1, expiresAt: 1, revokedAt: 1, commentCount: 2 }];
 const view = openShare();
 expect((screen.getByRole('button', { name: 'Summarize feedback' }) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText('This version has 2 notes. A summary needs at least 3.')).toBeTruthy();
 mocks.links = [...mocks.links, { id: 'review2', createdAt: 2, expiresAt: Date.now() + 100000, commentCount: 1 }];
 view.rerender(<ShareReview jobId="job1" duration={10} onSeek={() => {}} />);
 const summarize = screen.getByRole('button', { name: 'Summarize feedback' }) as HTMLButtonElement;
 expect(summarize.disabled).toBe(false);
 await act(async () => fireEvent.click(summarize));
 expect(mocks.summarize).toHaveBeenCalledWith({ jobId: 'job1' });
});
test('a stored summary shows sentiment, why, themes, a seekable sentiment timeline and the Gemini caveat', () => {
 const onSeek = vi.fn();
 mocks.links = [{ id: 'review1', createdAt: 1, expiresAt: 1, revokedAt: 1, commentCount: 4 }];
 mocks.summary = { sentiment: 'mixed', why: 'Strong hook, slow ending', themes: ['Hook', 'Ending'], noteCount: 3, createdAt: Date.UTC(2026, 9, 17, 12), notes: [
  { id: 'n1', at: 2.875, sentiment: 'negative' }, { id: 'n2', at: 1, sentiment: 'positive' }, { id: 'n3', at: 5, sentiment: 'mixed' },
 ] };
 const view = openShare({ onSeek });
 expect(screen.getByText('Mixed overall.')).toBeTruthy();
 expect(screen.getByText('Strong hook, slow ending')).toBeTruthy();
 expect(screen.getByRole('list', { name: 'Themes' }).textContent).toBe('HookEnding');
 expect(screen.getByText(`Gemini generated this summary from 3 notes on ${new Date(Date.UTC(2026, 9, 17, 12)).toLocaleString()}. It can misread tone or sarcasm, so check the notes before you act on it.`)).toBeTruthy();
 expect(screen.getByText('1 note is not in this summary. Summarize again to include new notes.')).toBeTruthy();
 expect(screen.getByRole('list', { name: 'Sentiment colors' }).textContent).toBe('PositiveMixedNegative');
 const marker = screen.getByRole('button', { name: 'Negative note at 00:02.875' });
 expect(marker.style.left).toBe('28.75%');
 fireEvent.click(marker);
 expect(onSeek).toHaveBeenCalledWith(2.875);
 view.unmount();
 openShare({ duration: undefined });
 expect(screen.queryByRole('group', { name: 'Note sentiment over the video' })).toBeNull();
 expect(screen.getByText('Mixed overall.')).toBeTruthy();
});
test.each([
 ['SUMMARY_RATE_LIMIT', 'Each version gets 3 summaries per hour. Try again later.'],
 ['SUMMARY_NEEDS_NOTES', 'A summary needs at least 3 notes on this version.'],
 ['SUMMARY_STALE', 'Notes changed while Gemini read them. Summarize again.'],
 ['SUMMARY_UNAVAILABLE', 'Gemini could not summarize these notes. Try again.'],
])('summary error %s shows its own copy', async (code, copy) => {
 mocks.links = [{ id: 'review1', createdAt: 1, expiresAt: 1, revokedAt: 1, commentCount: 3 }];
 mocks.summarize.mockRejectedValueOnce(Object.assign(Error('rejected'), { data: code }));
 openShare();
 await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Summarize feedback' })));
 expect(screen.getByRole('alert').textContent).toBe(copy);
});
