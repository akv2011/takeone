// @vitest-environment jsdom
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { RenderProgress } from '../src/components/RenderProgress';
afterEach(() => { cleanup(); vi.useRealTimers(); });
test('shows only recorded stages, actual elapsed time and completed boundaries', () => {
  vi.useFakeTimers(); vi.setSystemTime(10_000);
  render(<RenderProgress job={{ _id: 'a', status: 'processing', renderProgress: { attempt: 2, startedAt: 1000, stages: [{ stage: 'source', startedAt: 1000 }, { stage: 'cut', startedAt: 3000 }] } }} />);
  expect(screen.getByRole('status').textContent).toBe('Building the cut.');
  expect(screen.getByText('Attempt 2 · 9s elapsed')).toBeTruthy();
  expect(screen.getByText('2s · Completed')).toBeTruthy();
  expect(screen.getByText('7s · In progress')).toBeTruthy();
  expect(screen.queryByText('Adding captions and sound')).toBeNull();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByText('Attempt 2 · 11s elapsed')).toBeTruthy();
});
test('completed and failed attempts stop their clocks and label unfinished work honestly', () => {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  const progress = { attempt: 1, startedAt: 1000, finishedAt: 6000, stages: [{ stage: 'saving' as const, startedAt: 3000 }] };
  const view = render(<RenderProgress job={{ _id: 'a', status: 'done', renderProgress: progress }} />);
  expect(screen.getByText('3s · Completed')).toBeTruthy();
  view.rerender(<RenderProgress job={{ _id: 'a', status: 'failed', refunded: true, renderProgress: progress }} />);
  expect(screen.getByText('3s · Stopped')).toBeTruthy();
  expect(screen.getByText('Your allowance was restored.')).toBeTruthy();
  act(() => vi.advanceTimersByTime(20_000));
  expect(screen.getByText('Attempt 1 · 5s elapsed')).toBeTruthy();
});
test('queued retry hides old active stages and legacy jobs retain useful status', () => {
  const view = render(<RenderProgress job={{ _id: 'a', status: 'queued', createdAt: Date.now(), renderProgress: { attempt: 1, startedAt: 1, finishedAt: 2, stages: [{ stage: 'cut', startedAt: 1 }] } }} />);
  expect(screen.getByRole('status').textContent).toBe('Waiting for a render slot.');
  expect(screen.queryByRole('list')).toBeNull();
  view.rerender(<RenderProgress job={{ _id: 'b', status: 'processing' }} />);
  expect(screen.getByRole('status').textContent).toBe('Preparing your render.');
});
