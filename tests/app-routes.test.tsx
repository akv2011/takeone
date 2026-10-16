// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { authEnabled } from '../src/lib/convexApi';
import { AppRoutes } from '../src/AppRoutes';
afterEach(cleanup);

test.each(['/create', '/studio/job-1', '/studio/project/p1'])('%s explains missing sign-in instead of crashing without Firebase config', async path => {
  expect(authEnabled).toBe(false);
  render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Sign-in is not set up' })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
