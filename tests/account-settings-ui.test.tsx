// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  currentUser: undefined as unknown,
  updatePreferences: vi.fn(),
  queries: new Map<string, unknown>(),
  user: { id: 'creator-1', isGuest: false, name: 'Test User', email: 'creator@example.com' } as { id: string; isGuest: boolean; name?: string; email?: string },
  signOutUser: vi.fn(),
}));

vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
  GuestNotice: () => 'Guest session notice',
  signOutUser: mocks.signOutUser,
}));
vi.mock('convex/react', () => ({
  useQuery: (reference: unknown) => getFunctionName(reference as never) === 'users:currentUser' ? mocks.currentUser : mocks.queries.get(getFunctionName(reference as never)),
  useMutation: (reference: unknown) => getFunctionName(reference as never) === 'users:updatePreferences' ? mocks.updatePreferences : vi.fn(),
}));

import AccountPreferences from '../src/components/account/AccountPreferences';
import AccountBilling from '../src/components/account/AccountBilling';
import TakeOneUserButton from '../src/components/account/TakeOneUserButton';

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
  mocks.user = { id: 'creator-1', isGuest: false, name: 'Test User', email: 'creator@example.com' };
  mocks.signOutUser.mockReset().mockResolvedValue(undefined);
  // jsdom has no showModal or close, so these mirror what the browser does to the open attribute.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const openAccount = () => {
  render(React.createElement(MemoryRouter, {}, React.createElement(TakeOneUserButton)));
  fireEvent.click(screen.getByRole('button', { name: 'Account' }));
  return screen.getByRole('navigation', { name: 'Account pages' });
};

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

test('account dialog orders Account, Preferences and Billing and switches panels', () => {
  render(React.createElement(MemoryRouter, {}, React.createElement(TakeOneUserButton)));
  expect(screen.queryByRole('navigation', { name: 'Account pages' })).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Starting point' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Account' }));
  const nav = screen.getByRole('navigation', { name: 'Account pages' });
  expect(within(nav).getAllByRole('button').map(page => page.textContent)).toEqual(['Account', 'Preferences', 'Billing']);
  expect(within(nav).getByRole('button', { name: 'Account' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByText('Test User')).toBeTruthy();
  expect(screen.getByText('creator@example.com')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));

  fireEvent.click(within(nav).getByRole('button', { name: 'Preferences' }));
  expect(within(nav).getByRole('button', { name: 'Preferences' }).getAttribute('aria-current')).toBe('page');
  expect(within(nav).getByRole('button', { name: 'Account' }).getAttribute('aria-current')).toBeNull();
  expect(screen.getByRole('combobox', { name: 'Starting point' })).toBeTruthy();

  fireEvent.click(within(nav).getByRole('button', { name: 'Billing' }));
  expect(screen.getByText('Current plan')).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Starting point' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('navigation', { name: 'Account pages' })).toBeNull();
  expect(screen.queryByText('Current plan')).toBeNull();
});

test('a signed-in Google account signs out without a guest warning', async () => {
  const confirm = vi.spyOn(window, 'confirm');
  openAccount();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
  expect(confirm).not.toHaveBeenCalled();
  expect(mocks.signOutUser).toHaveBeenCalledTimes(1);
});

test('a guest sees the guest notice and must confirm before signing out', async () => {
  mocks.user = { id: 'guest-1', isGuest: true };
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  openAccount();
  expect(screen.getByText('Guest')).toBeTruthy();
  expect(screen.getByText('Guest session notice')).toBeTruthy();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('removes access to its videos'));
  expect(mocks.signOutUser).not.toHaveBeenCalled();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
  expect(mocks.signOutUser).toHaveBeenCalledTimes(1);
});
