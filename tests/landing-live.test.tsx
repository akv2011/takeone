// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import HeroSection from '../src/components/HeroSection';

// jsdom has no IntersectionObserver or matchMedia listeners; framer-motion and InkMark expect both.
class NoIntersection { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  vi.stubGlobal('IntersectionObserver', NoIntersection);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function CreateProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="create">{pathname + search}</p>;
}

const renderHero = () => render(
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<HeroSection />} />
      <Route path="/create" element={<CreateProbe />} />
    </Routes>
  </MemoryRouter>,
);
const target = () => new URL(screen.getByTestId('create').textContent!, 'https://x');

test('the hero composer hands a pasted link to the Create page', () => {
  renderHero();
  expect(screen.queryByText(/waitlist|early access|hackathon|builder cup/i)).toBeNull();
  expect(screen.getByText('free shorts').textContent).toContain('5');
  fireEvent.change(screen.getByRole('textbox', { name: 'Link to a long video' }), { target: { value: 'https://www.youtube.com/watch?v=iG9CE55wbtY' } });
  fireEvent.click(screen.getByRole('button', { name: 'Make a short' }));
  expect(target().pathname).toBe('/create');
  expect(Object.fromEntries(target().searchParams)).toEqual({ mode: 'link', url: 'https://www.youtube.com/watch?v=iG9CE55wbtY' });
});

test('prompt and upload modes send their own params', () => {
  renderHero();
  fireEvent.click(screen.getByRole('radio', { name: 'Prompt' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Describe the video' }), { target: { value: 'An orange paper rocket' } });
  fireEvent.submit(screen.getByRole('textbox', { name: 'Describe the video' }).closest('form')!);
  expect(Object.fromEntries(target().searchParams)).toEqual({ mode: 'prompt', q: 'An orange paper rocket' });
  cleanup();

  renderHero();
  fireEvent.click(screen.getByRole('radio', { name: 'Upload' }));
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Make a short' }));
  expect(Object.fromEntries(target().searchParams)).toEqual({ mode: 'upload' });
});

test('a link pasted into prompt mode switches the picker to Link', () => {
  renderHero();
  fireEvent.click(screen.getByRole('radio', { name: 'Prompt' }));
  fireEvent.paste(screen.getByRole('textbox', { name: 'Describe the video' }), { clipboardData: { getData: () => 'youtube.com/watch?v=iG9CE55wbtY' } });
  expect(screen.getByRole('radio', { name: 'Link' }).getAttribute('aria-checked')).toBe('true');
});
