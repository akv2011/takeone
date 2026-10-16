// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SpeakerReframe } from '../src/components/SpeakerReframe';
const request = vi.hoisted(() => vi.fn());
vi.mock('convex/react', () => ({ useMutation: () => request }));
afterEach(() => { cleanup(); request.mockReset(); });
const view = (accountKey = 'owner', duration = 10) => <MemoryRouter><SpeakerReframe jobId="source" accountKey={accountKey} duration={duration} /></MemoryRouter>;
test('one explicit click submits owned source and opens resulting version', async () => {
 request.mockResolvedValue({ jobId: 'portrait' }); render(view()); expect(request).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Follow speaker · 1 generation' }));
 expect((await screen.findByRole('link', { name: 'Open portrait version' })).getAttribute('href')).toBe('/studio/portrait');
 expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][0].sourceJobId).toBe('source');
});
test('overlong video cannot submit and stale account response stays hidden', async () => {
 const ui = render(view('owner', 61)); expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true); expect(request).not.toHaveBeenCalled();
 let resolve!: (v: unknown) => void; request.mockImplementation(() => new Promise(r => { resolve = r; }));
 ui.rerender(view('owner')); fireEvent.click(screen.getByRole('button'));
 ui.rerender(view('other')); await act(async () => resolve({ jobId: 'private' }));
 expect(screen.queryByRole('link')).toBeNull();
});
