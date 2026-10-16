// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/components/InteractiveWorkspace', () => ({ default: () => React.createElement('div', { 'aria-label': 'Product example' }) }));
vi.mock('convex/react', () => ({ useQuery: () => ({ rendering: { available: true }, stockVideo: { available: true }, youtubeClips: { available: true }, aiVideo: { available: true }, telegram: { available: true, username: 'Takeone_test_bot' }, payments: { available: true }, music: { available: true } }) }));

import HeroSection from '../src/components/HeroSection';
import FinalCTA from '../src/components/FinalCTA';

afterEach(cleanup);

test('the live landing page sends people directly into the product without a waitlist form', () => {
  render(React.createElement(MemoryRouter, {}, React.createElement(React.Fragment, {}, React.createElement(HeroSection), React.createElement(FinalCTA))));

  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByText(/waitlist|early access/i)).toBeNull();
  expect(screen.getAllByRole('link', { name: 'Create a video' })).toHaveLength(2);
  expect(screen.getAllByRole('link', { name: 'Create a video' })[0].getAttribute('href')).toBe('/create');
  expect(screen.getByRole('link', { name: 'Open Telegram' }).getAttribute('href')).toBe('https://t.me/Takeone_test_bot');
  expect(screen.getByText('3 videos free. No card needed.')).toBeTruthy();
});
