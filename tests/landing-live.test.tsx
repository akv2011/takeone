// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('convex/react', () => ({ useQuery: () => ({ rendering: { available: true }, stockVideo: { available: true }, youtubeClips: { available: true }, aiVideo: { available: true }, telegram: { available: true, username: 'Takeone_test_bot' }, payments: { available: true }, music: { available: true } }) }));

import HeroSection from '../src/components/HeroSection';
import FinalCTA from '../src/components/FinalCTA';

const stubReducedMotion = (matches: boolean) => { window.matchMedia = vi.fn(() => ({ matches })) as unknown as typeof window.matchMedia; };
beforeEach(() => stubReducedMotion(true));
afterEach(cleanup);

test('the live landing page sends people directly into the product without a waitlist form', () => {
  render(React.createElement(MemoryRouter, {}, React.createElement(React.Fragment, {}, React.createElement(HeroSection), React.createElement(FinalCTA))));

  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByText(/waitlist|early access/i)).toBeNull();
  expect(screen.getAllByRole('link', { name: 'Make a short' })).toHaveLength(2);
  for (const link of screen.getAllByRole('link', { name: 'Make a short' })) expect(link.getAttribute('href')).toBe('/create');
  expect(screen.getByRole('link', { name: 'See how' }).getAttribute('href')).toBe('#how-it-works');
  expect(screen.queryByRole('link', { name: /telegram/i })).toBeNull();
  expect(screen.getByText('3 videos free. No card needed.')).toBeTruthy();
});

const timecode = () => screen.getByText(/^\d{2}:\d{2}:\d{2}:\d{2}$/).textContent;
const renderHero = (reducedMotion: boolean) => {
  stubReducedMotion(reducedMotion);
  render(React.createElement(MemoryRouter, {}, React.createElement(HeroSection)));
};

test('the hero caption preview runs, pauses on request, and starts paused for reduced motion', () => {
  vi.useFakeTimers();
  try {
    renderHero(false);
    const start = timecode();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(timecode()).not.toBe(start);
    fireEvent.click(screen.getByRole('button', { name: 'Pause caption preview' }));
    const paused = timecode();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(timecode()).toBe(paused);
    cleanup();

    renderHero(true);
    expect(screen.getByRole('button', { name: 'Play caption preview' })).toBeTruthy();
    const still = timecode();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(timecode()).toBe(still);
  } finally { vi.useRealTimers(); }
});
