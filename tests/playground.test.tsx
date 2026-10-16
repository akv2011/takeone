// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import PromptPlayground from '../src/components/PromptPlayground';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

test('landing example explains its limits and leads to real creation instead of a fake download', async () => {
 vi.useFakeTimers();
 const original = Element.prototype.scrollIntoView;
 Element.prototype.scrollIntoView = vi.fn();
 try {
  render(<MemoryRouter><PromptPlayground /></MemoryRouter>);
  expect(screen.getByText(/No file is uploaded, rendered or charged here/)).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Trim 00:02 to 00:08' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show example' }));
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(screen.getByRole('link', { name: 'Create your video' }).getAttribute('href')).toBe('/create');
  expect(screen.getByText('Example complete. Open your dashboard to create a real video.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
 } finally { Element.prototype.scrollIntoView = original; }
});
