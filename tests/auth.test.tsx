// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type FakeUser = { uid: string; isAnonymous: boolean; email: string | null; displayName: string | null; photoURL: string | null; getIdToken: ReturnType<typeof vi.fn> };

const fb = vi.hoisted(() => ({
  auth: { currentUser: null as FakeUser | null },
  listener: undefined as ((user: FakeUser | null) => void) | undefined,
  signInWithPopup: vi.fn(),
  signInAnonymously: vi.fn(),
  linkWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({ auth: fb.auth }));
vi.mock('firebase/auth', () => ({
  onIdTokenChanged: (_auth: unknown, next: (user: FakeUser | null) => void) => { fb.listener = next; return () => { fb.listener = undefined; }; },
  signInWithPopup: fb.signInWithPopup,
  signInAnonymously: fb.signInAnonymously,
  linkWithPopup: fb.linkWithPopup,
  signOut: fb.signOut,
  GoogleAuthProvider: class GoogleAuthProvider {},
}));

import { GoogleAuthProvider } from 'firebase/auth';
import { AuthProvider, GuestNotice, SignedIn, SignedOut, SignInChoices, useFirebaseConvexAuth } from '../src/lib/auth';

const guestUser = (): FakeUser => ({ uid: 'guest-1', isAnonymous: true, email: null, displayName: null, photoURL: null, getIdToken: vi.fn() });

const fire = (user: FakeUser | null) => {
  fb.auth.currentUser = user;
  act(() => fb.listener!(user));
};

beforeEach(() => {
  fb.auth.currentUser = null;
  for (const fn of [fb.signInWithPopup, fb.signInAnonymously, fb.linkWithPopup, fb.signOut]) fn.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

test('a guest signs in anonymously, sees the guest notice, and loses it after saving with Google', async () => {
  render(<AuthProvider>
    <SignedOut><SignInChoices /></SignedOut>
    <SignedIn><p>Signed in content</p><GuestNotice /></SignedIn>
  </AuthProvider>);
  expect(screen.queryByRole('button', { name: 'Continue as guest' })).toBeNull();
  expect(screen.queryByText('Signed in content')).toBeNull();

  fire(null);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue as guest' })); });
  expect(fb.signInAnonymously).toHaveBeenCalledWith(fb.auth);

  const user = guestUser();
  fire(user);
  expect(screen.getByText('Signed in content')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Guest session' }).textContent).toContain('until you save them with Google');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save with Google' })); });
  expect(fb.linkWithPopup).toHaveBeenCalledWith(user, expect.any(GoogleAuthProvider));

  Object.assign(user, { isAnonymous: false, email: 'ana@example.com', displayName: 'Ana' });
  fire(user);
  expect(screen.getByText('Signed in content')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Guest session' })).toBeNull();
});

test('sign-in errors map to short messages and a closed popup shows nothing', async () => {
  render(<SignInChoices />);
  const google = screen.getByRole('button', { name: 'Continue with Google' });
  const guest = screen.getByRole('button', { name: 'Continue as guest' });

  let finish!: () => void;
  fb.signInWithPopup.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  fireEvent.click(google);
  expect((google as HTMLButtonElement).disabled).toBe(true);
  expect((guest as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish());
  expect((guest as HTMLButtonElement).disabled).toBe(false);
  expect(fb.signInWithPopup).toHaveBeenCalledWith(fb.auth, expect.any(GoogleAuthProvider));

  fb.signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
  await act(async () => { fireEvent.click(google); });
  expect(screen.queryByRole('alert')).toBeNull();

  fb.signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-blocked' });
  await act(async () => { fireEvent.click(google); });
  expect(screen.getByRole('alert').textContent).toContain('Allow pop-ups');

  fb.signInAnonymously.mockRejectedValueOnce(new Error('boom'));
  await act(async () => { fireEvent.click(guest); });
  expect(screen.getByRole('alert').textContent).toBe('Sign-in did not finish. Try again.');
});

test('saving a guest into a Google account that already has TakeOne explains the videos stay put', async () => {
  render(<AuthProvider><GuestNotice /></AuthProvider>);
  fire(guestUser());
  fb.linkWithPopup.mockRejectedValueOnce({ code: 'auth/credential-already-in-use' });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save with Google' })); });
  expect(screen.getByRole('alert').textContent).toContain('already has a TakeOne account');
  expect(screen.getByRole('region', { name: 'Guest session' })).toBeTruthy();
});

test('the Convex bridge loads first, returns ID tokens, and keeps fetchAccessToken stable across token refreshes', async () => {
  const seen: ReturnType<typeof useFirebaseConvexAuth>[] = [];
  function Probe() { seen.push(useFirebaseConvexAuth()); return null; }
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(seen.at(-1)).toMatchObject({ isLoading: true, isAuthenticated: false });

  fire(null);
  expect(seen.at(-1)).toMatchObject({ isLoading: false, isAuthenticated: false });
  await expect(seen.at(-1)!.fetchAccessToken({ forceRefreshToken: false })).resolves.toBeNull();

  const user = guestUser();
  user.getIdToken.mockResolvedValue('token-1');
  fire(user);
  const first = seen.at(-1)!;
  expect(first).toMatchObject({ isLoading: false, isAuthenticated: true });
  await expect(first.fetchAccessToken({ forceRefreshToken: true })).resolves.toBe('token-1');
  expect(user.getIdToken).toHaveBeenCalledWith(true);

  user.getIdToken.mockRejectedValueOnce(new Error('offline'));
  await expect(first.fetchAccessToken({ forceRefreshToken: false })).resolves.toBeNull();

  fire(user);
  expect(seen.at(-1)!.fetchAccessToken).toBe(first.fetchAccessToken);

  Object.assign(user, { isAnonymous: false, email: 'ana@example.com' });
  fire(user);
  expect(seen.at(-1)!.fetchAccessToken).not.toBe(first.fetchAccessToken);
  expect(seen.at(-1)).toMatchObject({ isLoading: false, isAuthenticated: true });
});
