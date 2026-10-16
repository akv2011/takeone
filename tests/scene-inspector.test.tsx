// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authenticated: true, query: vi.fn() }));
vi.mock('convex/react', () => ({ useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }), useQuery: mocks.query }));
import { SceneInspector } from '../src/components/SceneInspector';
const scenes = [{ startSec: 0, endSec: 2, purpose: 'Soap texture', searchTerms: ['soap foam'], shotType: 'Macro', motion: 'Slow push' }, { startSec: 2, endSec: 4, purpose: 'Daily use', searchTerms: ['hands washing'], shotType: 'Closeup', motion: 'Static' }];
const plan = { state: 'completed', attempt: 1, durationSec: 4, scenes };
const props = () => ({ jobId: 'source', accountKey: 'owner', currentTime: 2.5, duration: 4, playbackDisabled: false, onSeek: vi.fn() });
beforeEach(() => { mocks.authenticated = true; mocks.query.mockReset().mockReturnValue(plan); });
afterEach(cleanup);
test('queries only owned scope and completed scene click seeks without a render', () => {
 const p = props(); render(<SceneInspector {...p} />);
 expect(mocks.query.mock.calls[0][1]).toEqual({ jobId: 'source', accountKey: 'owner' });
 const second = screen.getByRole('button', { name: /Daily use/ });
 expect(second.getAttribute('aria-current')).toBe('true');
 fireEvent.click(second); expect(p.onSeek).toHaveBeenCalledExactlyOnceWith(2);
 expect(screen.queryByRole('button', { name: /Replace|Remove|Apply/ })).toBeNull();
});
test.each(['rendering', 'failed', 'cancelled', 'previous_attempt'])('%s plans never seek the prior completed video', state => {
 mocks.query.mockReturnValue({ ...plan, state });
 const p = props(); render(<SceneInspector {...p} />);
 const first = screen.getByRole('button', { name: /Soap texture/ }) as HTMLButtonElement;
 expect(first.disabled).toBe(true); fireEvent.click(first); expect(p.onSeek).not.toHaveBeenCalled();
});
test('auth loss skips reading and hides previously visible scene cards', () => {
 const p = props(); const view = render(<SceneInspector {...p} />);
 mocks.authenticated = false;
 view.rerender(<SceneInspector {...p} />);
 expect(mocks.query.mock.calls.at(-1)?.[1]).toBe('skip');
 expect(screen.queryByText('Soap texture')).toBeNull();
});
test('changing job and account binds the query to the new owner and clears old cards', () => {
 const p = props(); const view = render(<SceneInspector {...p} />);
 mocks.query.mockReturnValue(undefined);
 view.rerender(<SceneInspector {...p} jobId="other" accountKey="second" />);
 expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual({ jobId: 'other', accountKey: 'second' });
 expect(screen.queryByText('Soap texture')).toBeNull();
 expect(screen.getByRole('status').textContent).toContain('Loading');
});
test.each([null, { state: 'unavailable', scenes: [] }, { ...plan, scenes: [{ ...scenes[0], endSec: NaN }] }])('unavailable or malformed plans do not expose navigation %#', result => {
 mocks.query.mockReturnValue(result); const p = props(); render(<SceneInspector {...p} />);
 expect(screen.getByText(/no saved scene plan/)).toBeTruthy();
 expect(screen.queryAllByRole('button')).toHaveLength(0);
});
test('requires matching loaded video duration before navigating a completed plan', () => {
 const p = props(); render(<SceneInspector {...p} duration={1} />);
 expect((screen.getByRole('button', { name: /Soap texture/ }) as HTMLButtonElement).disabled).toBe(true);
});
test('shows a valid detailed soap search phrase longer than sixty characters', () => {
 const phrase = 'natural handmade soap foam macro botanical ingredients soft daylight clean bathroom hands washing';
 mocks.query.mockReturnValue({ ...plan, scenes: [{ ...scenes[0], searchTerms: [phrase] }, scenes[1]] });
 render(<SceneInspector {...props()} />);
 expect(screen.getByText(phrase)).toBeTruthy();
});
test('failed scene queries have a local retry boundary', () => {
 const log = vi.spyOn(console, 'error').mockImplementation(() => {});
 try {
  mocks.query.mockImplementation(() => { throw Error('internal provider detail'); });
  render(<SceneInspector {...props()} />);
  expect(screen.getByRole('alert').textContent).not.toContain('internal provider');
  mocks.query.mockReturnValue(plan);
  fireEvent.click(screen.getByRole('button', { name: 'Retry scene details' }));
  expect(screen.getByRole('button', { name: /Soap texture/ })).toBeTruthy();
 } finally { log.mockRestore(); }
});
