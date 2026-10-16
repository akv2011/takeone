// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HookVariants } from '../src/components/HookVariants';
const request = vi.hoisted(() => vi.fn());
vi.mock('convex/react', () => ({ useMutation: () => request }));
beforeEach(() => { request.mockReset().mockResolvedValue({ jobIds: ['one', 'two', 'three'] }); });
afterEach(cleanup);
function view(accountKey = 'owner', jobId = 'source') { return <MemoryRouter><HookVariants accountKey={accountKey} jobId={jobId} videoUrl="/fixture.mp4" /></MemoryRouter>; }
function fill() { ['Question opening', 'Benefit opening', 'Surprise opening'].forEach((value, i) => fireEvent.change(screen.getByLabelText(`Hook ${i + 1}`), { target: { value } })); }
test('preview never submits; export submits exactly one atomic batch and exposes three versions', async () => {
 render(view()); fill();
 fireEvent.click(screen.getByRole('button', { name: 'Preview hook 2 · free' }));
 expect(screen.getByLabelText('Opening title preview')).toBeTruthy(); expect(request).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Create 3 versions · 3 generations' }));
 await screen.findByRole('link', { name: 'Open hook 3' });
 expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][0]).toMatchObject({ sourceJobId: 'source', titles: ['Question opening', 'Benefit opening', 'Surprise opening'] });
});
test('failed submission preserves identity for retry and changed content gets a new identity', async () => {
 request.mockRejectedValue(Error('network')); render(view()); fill();
 const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create 3 versions · 3 generations' }));
 submit(); await screen.findByRole('alert'); const first = request.mock.calls[0][0].requestId;
 submit(); await waitFor(() => expect(request).toHaveBeenCalledTimes(2)); await screen.findByRole('alert');
 expect(request.mock.calls[1][0].requestId).toBe(first);
 fireEvent.change(screen.getByLabelText('Hook 1'), { target: { value: 'A changed opening' } });
 submit(); await waitFor(() => expect(request).toHaveBeenCalledTimes(3)); expect(request.mock.calls[2][0].requestId).not.toBe(first);
});
test('late account response does not expose previous owner result links', async () => {
 let resolve!: (v: unknown) => void; request.mockImplementation(() => new Promise(r => { resolve = r; }));
 const ui = render(view()); fill(); fireEvent.click(screen.getByRole('button', { name: 'Create 3 versions · 3 generations' }));
 ui.rerender(view('other'));
 await act(async () => resolve({ jobIds: ['private-one', 'private-two', 'private-three'] }));
 expect(screen.queryByRole('link', { name: 'Open hook 1' })).toBeNull(); expect((screen.getByLabelText('Hook 1') as HTMLInputElement).value).toBe('');
});
