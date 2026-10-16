// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { TranscriptNavigator } from '../src/components/TranscriptNavigator';
afterEach(cleanup);
const cues = [{ start: 0.125, end: 1.5, text: 'Natural soap ingredients' }, { start: 2, end: 3.875, text: 'Hands washing with SOAP' }];
const props = () => ({ jobId: 'source', accountKey: 'owner', available: true, playbackDisabled: false, currentTime: 0, loadCues: vi.fn(async () => cues), onSeek: vi.fn(), onPreview: vi.fn() });
test('loads only on request, searches all cues and seeks or previews without a render', async () => {
 const p = props(); render(<TranscriptNavigator {...p} />);
 expect(p.loadCues).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 await screen.findByRole('button', { name: /Natural soap ingredients/ });
 fireEvent.change(screen.getByLabelText('Search transcript'), { target: { value: 'washing' } });
 expect(screen.queryByRole('button', { name: /Natural soap ingredients/ })).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: /Hands washing/ }));
 expect(p.onSeek).toHaveBeenCalledExactlyOnceWith(2);
 fireEvent.click(screen.getByRole('button', { name: 'Preview cue 2' }));
 expect(p.onPreview).toHaveBeenCalledExactlyOnceWith(2, 3.875, 1);
 expect(p.loadCues).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('button', { name: /Apply|generation/ })).toBeNull();
 fireEvent.change(screen.getByLabelText('Search transcript'), { target: { value: 'sOaP' } });
 expect(screen.getByRole('button', { name: /Natural soap ingredients/ })).toBeTruthy();
 expect(screen.getByRole('button', { name: /Hands washing/ })).toBeTruthy();
});
test('highlights the current cue with exclusive end boundaries', async () => {
 const p = props(); const view = render(<TranscriptNavigator {...p} currentTime={0.5} />);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 const first = await screen.findByRole('button', { name: /Natural soap ingredients/ });
 expect(first.getAttribute('aria-current')).toBe('true');
 view.rerender(<TranscriptNavigator {...p} currentTime={1.5} />);
 expect(first.hasAttribute('aria-current')).toBe(false);
 view.rerender(<TranscriptNavigator {...p} currentTime={2} />);
 expect(screen.getByRole('button', { name: /Hands washing/ }).getAttribute('aria-current')).toBe('true');
});
test.each(['job', 'account', 'unavailable'] as const)('late response cannot restore cues after %s changes', async change => {
 let resolve!: (value: typeof cues) => void;
 const p = { ...props(), loadCues: vi.fn(() => new Promise<typeof cues>(done => { resolve = done; })) };
 const view = render(<TranscriptNavigator {...p} />);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 view.rerender(<TranscriptNavigator {...p} jobId={change === 'job' ? 'new-job' : p.jobId} accountKey={change === 'account' ? 'other' : p.accountKey} available={change !== 'unavailable'} />);
 await act(async () => resolve(cues));
 expect(screen.queryByText('Natural soap ingredients')).toBeNull();
 expect(screen.queryByLabelText('Search transcript')).toBeNull();
});
test.each([
 [{ start: -1, end: 1, text: 'bad' }], [{ start: 0, end: Infinity, text: 'bad' }],
 [{ start: 2, end: 1, text: 'bad' }], [{ start: 0, end: 301, text: 'bad' }],
 [{ start: 1, end: 2, text: 'first' }, { start: 0, end: 1, text: 'unordered' }],
 [{ start: 0, end: 1, text: '' }],
])('rejects invalid saved cues without making playback calls %#', async invalid => {
 const p = { ...props(), loadCues: vi.fn(async () => invalid) }; render(<TranscriptNavigator {...p} />);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 expect(await screen.findByRole('alert')).toBeTruthy();
 expect(screen.queryByLabelText('Search transcript')).toBeNull();
 expect(p.onSeek).not.toHaveBeenCalled(); expect(p.onPreview).not.toHaveBeenCalled();
});
test('missing archives are honest and never loaded', () => {
 const p = props(); render(<TranscriptNavigator {...p} available={false} />);
 expect(screen.getByText(/This version has no saved transcript/)).toBeTruthy();
 expect(screen.queryByRole('button', { name: /Load/ })).toBeNull();
 expect(p.loadCues).not.toHaveBeenCalled();
});
test('search reaches beyond the rendered page and playback stays disabled without video', async () => {
 const many = Array.from({ length: 45 }, (_, index) => ({ start: index * 2, end: index * 2 + 1, text: `Phrase ${index + 1}` }));
 const p = { ...props(), loadCues: vi.fn(async () => many) };
 render(<TranscriptNavigator {...p} playbackDisabled />);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 await screen.findByLabelText('Search transcript');
 expect(screen.getAllByRole('listitem')).toHaveLength(20);
 fireEvent.change(screen.getByLabelText('Search transcript'), { target: { value: 'Phrase 45' } });
 const cue = screen.getByRole('button', { name: /Phrase 45/ }) as HTMLButtonElement;
 expect(cue.disabled).toBe(true); expect(screen.getAllByRole('listitem')).toHaveLength(1);
 expect(p.loadCues).toHaveBeenCalledTimes(1);
});
test('checks saved timing against video metadata that arrives after loading', async () => {
 const p = props(); const view = render(<TranscriptNavigator {...p} />);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 await screen.findByLabelText('Search transcript');
 view.rerender(<TranscriptNavigator {...p} duration={3} />);
 expect(screen.getByRole('alert')).toBeTruthy();
 expect(screen.queryByRole('button', { name: /Hands washing/ })).toBeNull();
 expect(p.onSeek).not.toHaveBeenCalled();
});
test('failed reads can retry without issuing duplicate reads while pending', async () => {
 const p = { ...props(), loadCues: vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(cues) };
 render(<TranscriptNavigator {...p} />);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 await screen.findByLabelText('Search transcript');
 expect(p.loadCues).toHaveBeenCalledTimes(2);
 expect(screen.queryByRole('alert')).toBeNull();
});
test('valid codec-tail cues stay searchable and preview clamps to the loaded video end', async () => {
 const tail = [{ start: 2, end: 3.05, text: 'Last words' }, { start: 3.01, end: 3.05, text: 'Beyond final frame' }];
 const p = { ...props(), loadCues: vi.fn(async () => tail) };
 render(<TranscriptNavigator {...p} duration={3} />);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 await screen.findByLabelText('Search transcript');
 fireEvent.click(screen.getByRole('button', { name: 'Preview cue 1' }));
 expect(p.onPreview).toHaveBeenCalledExactlyOnceWith(2, 3, 1);
 expect((screen.getByRole('button', { name: /Beyond final frame/ }) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.queryByRole('alert')).toBeNull();
});
test('mismatched timing offers an actual reload control', async () => {
 const p = { ...props(), loadCues: vi.fn().mockResolvedValueOnce(cues).mockResolvedValueOnce([{ start: 0, end: 1, text: 'Correct source words' }]) };
 render(<TranscriptNavigator {...p} duration={2} />);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button', { name: 'Reload transcript · free' }));
 expect(await screen.findByRole('button', { name: /Correct source words/ })).toBeTruthy();
 expect(screen.queryByRole('alert')).toBeNull();
 expect(p.loadCues).toHaveBeenCalledTimes(2);
});
