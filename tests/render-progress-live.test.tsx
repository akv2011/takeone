// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type Snap = { exists: () => boolean; data: () => object | undefined };
const onSnapshot = vi.hoisted(() => vi.fn<(path: string, next: (snap: Snap) => void, error: (error: Error) => void) => () => void>(() => vi.fn()));
vi.mock('../src/lib/firebase', () => ({ app: {} }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), doc: (_db: unknown, ...path: string[]) => path.join('/'), onSnapshot }));

import { RenderProgress } from '../src/components/RenderProgress';

const snap = (data?: object): Snap => ({ exists: () => data !== undefined, data: () => data });
const shown = () => screen.queryAllByRole('listitem').map(item => item.firstElementChild?.lastChild?.textContent);
const status = () => screen.getByRole('status').textContent;
const listener = () => {
  const [path, next, error] = onSnapshot.mock.calls[0];
  return { path, next: (data?: object) => act(() => next(snap(data))), error: () => act(() => error(Error('permission-denied'))) };
};
const job = (renderProgress = { attempt: 1, startedAt: 1000, stages: [{ stage: 'source' as const, startedAt: 1000 }] }) =>
  ({ _id: 'job-1', status: 'processing', renderProgress });

beforeEach(() => onSnapshot.mockClear());
afterEach(() => { cleanup(); vi.useRealTimers(); });

test('a processing job shows the Firestore stages live, timed from Convex where Convex has them', () => {
  vi.useFakeTimers(); vi.setSystemTime(10_000);
  render(<RenderProgress job={job()} />);
  const live = listener();
  expect(live.path).toBe('renders/job-1');
  expect(status()).toBe('Loading the source video.');
  live.next({ stage: 'cut', stages: ['source', 'transcription', 'cut'], status: 'processing', updatedAt: { toMillis: () => 6000 } });
  expect(status()).toBe('Building the cut.');
  expect(shown()).toEqual(['Loading the source video', 'Timing captions to speech', 'Building the cut']);
  expect(screen.getByText('5s · Completed')).toBeTruthy();
  expect(screen.getByText('0s · Completed')).toBeTruthy();
  expect(screen.getByText('4s · In progress')).toBeTruthy();
  expect(screen.getByText('Attempt 1 · 9s elapsed')).toBeTruthy();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByText('6s · In progress')).toBeTruthy();
});

test('a retry shows only the stages up to the latest one, not the earlier attempt', () => {
  render(<RenderProgress job={job({ attempt: 2, startedAt: 2000, stages: [] })} />);
  listener().next({ stage: 'source', stages: ['source', 'transcription', 'cut'] });
  expect(shown()).toEqual(['Loading the source video']);
  expect(status()).toBe('Loading the source video.');
  expect(screen.getByText(/^Attempt 2 · /)).toBeTruthy();
});

test('a missing doc or a snapshot error falls back to the Convex stages', () => {
  render(<RenderProgress job={job()} />);
  const live = listener();
  const firestoreDoc = { stage: 'cut', stages: ['source', 'transcription', 'cut'] };
  live.next(firestoreDoc);
  expect(shown()).toHaveLength(3);
  live.next();
  expect(shown()).toEqual(['Loading the source video']);
  live.next(firestoreDoc);
  expect(shown()).toHaveLength(3);
  live.error();
  expect(shown()).toEqual(['Loading the source video']);
});

test('unknown stage names, inherited keys like toString and non-strings are ignored', () => {
  render(<RenderProgress job={job()} />);
  const live = listener();
  live.next({ stage: 'cut', stages: ['source', 'toString', 'warp', 42, 'cut'] });
  expect(shown()).toEqual(['Loading the source video', 'Building the cut']);
  live.next({ stage: 'toString', stages: ['source', 'transcription', 'toString'] });
  expect(shown()).toEqual(['Loading the source video', 'Timing captions to speech']);
  live.next({ stage: 'warp', stages: ['toString', 'warp'] });
  expect(shown()).toEqual(['Loading the source video']);
});

test('queued, dispatched and finished jobs never open a listener', () => {
  const progress = { attempt: 1, startedAt: 1000, finishedAt: 5000, stages: [{ stage: 'saving' as const, startedAt: 2000 }] };
  for (const state of ['queued', 'dispatched', 'done', 'failed', 'cancelled']) {
    render(<RenderProgress job={{ _id: 'job-1', status: state, createdAt: 1000, renderProgress: progress }} />);
    cleanup();
  }
  expect(onSnapshot).not.toHaveBeenCalled();
});

test('unmounting or leaving processing closes the listener and drops the live stages', () => {
  const view = render(<RenderProgress job={job()} />);
  view.unmount();
  expect(onSnapshot.mock.results[0].value).toHaveBeenCalledTimes(1);

  const finished = { attempt: 1, startedAt: 1000, finishedAt: 5000, stages: [{ stage: 'source' as const, startedAt: 1000 }] };
  const next = render(<RenderProgress job={job()} />);
  const stop = onSnapshot.mock.results[1].value;
  act(() => onSnapshot.mock.calls[1][1](snap({ stage: 'cut', stages: ['source', 'cut'] })));
  expect(shown()).toHaveLength(2);
  next.rerender(<RenderProgress job={{ ...job(finished), status: 'done' }} />);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(shown()).toEqual(['Loading the source video']);
  expect(onSnapshot).toHaveBeenCalledTimes(2);
});
