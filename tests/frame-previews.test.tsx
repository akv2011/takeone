// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FramePreviews } from '../src/components/FramePreviews';
const extract = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/videoFrames', () => ({ extractVideoFrames: extract }));
beforeEach(() => { extract.mockReset(); });
afterEach(cleanup);
test('loads only on request and frame selection only seeks', async () => {
 extract.mockResolvedValue([{ time: 1.25, image: 'data:image/jpeg;base64,AA==' }]);
 const seek = vi.fn(); render(<FramePreviews url="https://test/video" disabled={false} onSeek={seek} />);
 expect(extract).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: /Load frame previews/ }));
 fireEvent.click(await screen.findByRole('button', { name: 'Seek to 1.250 seconds' }));
 expect(seek).toHaveBeenCalledWith(1.25); expect(extract).toHaveBeenCalledOnce();
});
test('cancel discards late results and permits another attempt', async () => {
 let resolve!: (frames: unknown[]) => void;
 extract.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce([{ time: 2, image: 'data:image/jpeg;base64,AA==' }]);
 render(<FramePreviews url="https://test/video" disabled={false} onSeek={vi.fn()} />);
 fireEvent.click(screen.getByRole('button', { name: /Load frame previews/ }));
 const signal = extract.mock.calls[0][1] as AbortSignal;
 fireEvent.click(screen.getByRole('button', { name: 'Cancel frame previews' })); expect(signal.aborted).toBe(true);
 await act(async () => resolve([{ time: 1, image: 'old' }]));
 expect(screen.queryByRole('button', { name: /Seek to/ })).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: /Load frame previews/ }));
 expect(await screen.findByRole('button', { name: 'Seek to 2.000 seconds' })).toBeTruthy();
});
test('source remount aborts extraction without showing old frames', async () => {
 let resolve!: (frames: unknown[]) => void; extract.mockImplementation(() => new Promise(r => { resolve = r; }));
 const view = render(<FramePreviews key="old" url="https://test/old" disabled={false} onSeek={vi.fn()} />);
 fireEvent.click(screen.getByRole('button', { name: /Load frame previews/ }));
 const signal = extract.mock.calls[0][1] as AbortSignal;
 view.rerender(<FramePreviews key="new" url="https://test/new" disabled={false} onSeek={vi.fn()} />);
 expect(signal.aborted).toBe(true); await act(async () => resolve([{ time: 1, image: 'old' }]));
 expect(screen.queryByRole('button', { name: /Seek to/ })).toBeNull();
});
test('failure allows retry and disabled controls cannot start extraction', async () => {
 extract.mockRejectedValue(Error('cors'));
 const view = render(<FramePreviews url="https://test/video" disabled onSeek={vi.fn()} />);
 fireEvent.click(screen.getByRole('button', { name: /Load frame previews/ })); expect(extract).not.toHaveBeenCalled();
 view.rerender(<FramePreviews url="https://test/video" disabled={false} onSeek={vi.fn()} />);
 fireEvent.click(screen.getByRole('button', { name: /Load frame previews/ }));
 await waitFor(() => expect(screen.getByRole('status').textContent).toContain('still seek and trim'));
 expect((screen.getByRole('button', { name: /Load frame previews/ }) as HTMLButtonElement).disabled).toBe(false);
});
