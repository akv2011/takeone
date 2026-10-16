// @vitest-environment jsdom
import { lazy } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PageBoundary } from '../src/components/PageBoundary';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('page download shows an accessible loading state before rendering content', async () => {
 let resolve!: (module: { default: () => React.ReactNode }) => void;
 const Page = lazy(() => new Promise<{ default: () => React.ReactNode }>(done => { resolve = done; }));
 render(<PageBoundary retryUrl="/create"><Page /></PageBoundary>);
 expect(screen.getByRole('status').textContent).toBe('Loading TakeOne…');
 await act(async () => { resolve({ default: () => <h1>Your videos</h1> }); });
 expect(screen.getByRole('heading', { name: 'Your videos' })).toBeTruthy();
 expect(screen.queryByRole('status')).toBeNull();
});
test('a failed chunk shows recovery without leaking errors and a new route can render', async () => {
 vi.spyOn(console, 'error').mockImplementation(() => {});
 const Broken = lazy(async () => { throw new Error('private deployment details'); });
 const view = render(<PageBoundary key="broken" retryUrl="/studio/video?from=history"><Broken /></PageBoundary>);
 await act(async () => {});
 expect(screen.getByRole('alert').textContent).toContain('This page couldn’t load');
 expect(screen.queryByText('private deployment details')).toBeNull();
 expect(screen.getByRole('link', { name: 'Reload page' }).getAttribute('href')).toBe('/studio/video?from=history');
 view.rerender(<PageBoundary key="new-route" retryUrl="/create"><h1>Your videos</h1></PageBoundary>);
 expect(screen.getByRole('heading', { name: 'Your videos' })).toBeTruthy();
 expect(screen.queryByRole('alert')).toBeNull();
});
