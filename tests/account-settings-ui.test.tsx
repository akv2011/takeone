// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  currentUser: undefined as unknown,
  updatePreferences: vi.fn(),
  queries: new Map<string, unknown>(),
  profilePages: [] as string[],
}));

vi.mock('@clerk/clerk-react', () => {
  const UserButton = ({ children }: { children?: React.ReactNode }) => children ?? null;
  UserButton.UserProfilePage = ({ children, label }: { children?: React.ReactNode; label: string }) => {
    mocks.profilePages.push(label);
    return children ?? null;
  };
  return { UserButton, useUser: () => ({ user: { id: 'creator-1' } }) };
});
vi.mock('convex/react', () => ({
  useQuery: (reference: unknown) => getFunctionName(reference as never) === 'users:currentUser' ? mocks.currentUser : mocks.queries.get(getFunctionName(reference as never)),
  useMutation: (reference: unknown) => getFunctionName(reference as never) === 'users:updatePreferences' ? mocks.updatePreferences : vi.fn(),
}));

import AccountPreferences from '../src/components/account/AccountPreferences';
import AccountBilling from '../src/components/account/AccountBilling';
import TakeOneUserButton from '../src/components/account/TakeOneUserButton';
import { clerkAppearance } from '../src/lib/clerkTheme';

const preferences = {
  defaultMode: 'clip' as const,
  defaultAspect: '16:9' as const,
  defaultCaptionStyle: 'clean' as const,
  openFinishedInStudio: true,
  showShortcutHints: false,
};

beforeEach(() => {
  mocks.currentUser = { preferences };
  mocks.updatePreferences.mockReset().mockResolvedValue(preferences);
  mocks.queries.clear();
  mocks.profilePages = [];
});

afterEach(cleanup);

test('Preferences loads saved values and enables save only after an edit', async () => {
  render(React.createElement(AccountPreferences));

  expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveProperty('value', 'clip');
  expect(screen.getByRole('combobox', { name: 'Aspect ratio' })).toHaveProperty('value', '16:9');
  expect(screen.getByRole('combobox', { name: 'Caption style' })).toHaveProperty('value', 'clean');
  expect(screen.getByRole('switch', { name: 'Open finished videos in Studio' })).toHaveProperty('checked', true);
  expect(screen.getByRole('switch', { name: 'Show keyboard shortcuts' })).toHaveProperty('checked', false);
  expect(screen.getByRole('button', { name: 'Save preferences' })).toHaveProperty('disabled', true);

  fireEvent.change(screen.getByRole('combobox', { name: 'Aspect ratio' }), { target: { value: '1:1' } });
  fireEvent.click(screen.getByRole('switch', { name: 'Show keyboard shortcuts' }));
  const save = screen.getByRole('button', { name: 'Save preferences' });
  expect(save).toHaveProperty('disabled', false);
  fireEvent.click(save);

  await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalledWith({
    ...preferences,
    defaultAspect: '1:1',
    showShortcutHints: true,
  }));
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(save).toHaveProperty('disabled', true);
});

test('Preferences preserves an unsaved choice when saving fails', async () => {
  mocks.updatePreferences.mockRejectedValue(new Error('offline'));
  render(React.createElement(AccountPreferences));

  fireEvent.change(screen.getByRole('combobox', { name: 'Starting point' }), { target: { value: 'generate' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Could not save your preferences. Try again.');
  expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveProperty('value', 'generate');
  expect(screen.getByRole('button', { name: 'Save preferences' })).toHaveProperty('disabled', false);
});

test('Preferences does not replace an unsaved choice when the balance refreshes', () => {
  mocks.currentUser = { credits: 0, preferences };
  const view = render(React.createElement(AccountPreferences));
  fireEvent.change(screen.getByRole('combobox', { name: 'Starting point' }), { target: { value: 'generate' } });

  mocks.currentUser = { credits: 25, preferences };
  view.rerender(React.createElement(AccountPreferences));

  expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveProperty('value', 'generate');
  expect(screen.getByRole('button', { name: 'Save preferences' })).toHaveProperty('disabled', false);
});

test('Billing shows only the current free plan and a Pricing link', () => {
  mocks.currentUser = { freeRemaining: 2, credits: 0, creditAdjustment: 0 };
  render(React.createElement(MemoryRouter, {}, React.createElement(AccountBilling)));

  expect(screen.getByText('Current plan')).toBeTruthy();
  expect(screen.getByText('Free')).toBeTruthy();
  expect(screen.queryByText(/free allowance/i)).toBeNull();
  expect(screen.queryByText(/personal balance|purchased balance/i)).toBeNull();
  expect(screen.queryByText(/2 free|0 credits/i)).toBeNull();
  expect(screen.getByRole('link', { name: 'Upgrade' }).getAttribute('href')).toBe('/pricing');
});

test('Billing labels accounts with purchased credits as pay as you go without showing a balance', () => {
  mocks.currentUser = { freeRemaining: 0, credits: 100, creditAdjustment: 0 };
  render(React.createElement(MemoryRouter, {}, React.createElement(AccountBilling)));

  expect(screen.getByText('Pay as you go')).toBeTruthy();
  expect(screen.queryByText(/100 credits/i)).toBeNull();
  expect(screen.getByRole('link', { name: 'View plans' }).getAttribute('href')).toBe('/pricing');
});

test('shared user button orders the four account pages', () => {
  render(React.createElement(MemoryRouter, {}, React.createElement(TakeOneUserButton)));
  expect(mocks.profilePages).toEqual(['account', 'Preferences', 'security', 'Billing']);
});

test('account appearance is monochrome and removes the danger section', () => {
  const serialized = JSON.stringify(clerkAppearance).toLowerCase();
  expect(serialized).not.toContain('#2563eb');
  expect(serialized).not.toContain('blue');
  expect(serialized).not.toContain('rgb(37, 99, 235)');
  expect((clerkAppearance.elements as Record<string, unknown>).profileSection__danger).toEqual({ display: 'none' });
});
