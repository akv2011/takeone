import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GoogleAuthProvider, linkWithPopup, onIdTokenChanged, signInAnonymously, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import { GoogleLogo, UserCircle } from '@phosphor-icons/react';
import { button } from './ui';

export type AuthUser = { id: string; isGuest: boolean; email?: string; name?: string; photoURL?: string };
type AuthState = { user: AuthUser | null; loading: boolean };

const AuthContext = createContext<AuthState>({ user: null, loading: false });

const snapshot = (user: User): AuthUser => ({
  id: user.uid,
  isGuest: user.isAnonymous,
  email: user.email ?? undefined,
  name: user.displayName ?? undefined,
  photoURL: user.photoURL ?? undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: !!auth });
  useEffect(() => {
    if (!auth) return;
    // linkWithPopup mutates the same User and the hourly token refresh fires here too. Keeping the previous
    // snapshot when nothing changed keeps fetchAccessToken stable, so Convex does not re-authenticate every hour.
    return onIdTokenChanged(auth, next => setState(prev => {
      const user = next && snapshot(next);
      return !prev.loading && JSON.stringify(prev.user) === JSON.stringify(user) ? prev : { user, loading: false };
    }));
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function SignedIn({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  return !loading && user ? children : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  return !loading && !user ? children : null;
}

function firebaseAuth() {
  if (!auth) throw new Error('Sign-in is not set up for this deployment.');
  return auth;
}

export async function signInWithGoogle() {
  await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
}

export async function continueAsGuest() {
  await signInAnonymously(firebaseAuth());
}

export async function saveWithGoogle() {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error('There is no guest session to save.');
  await linkWithPopup(user, new GoogleAuthProvider());
}

export async function signOutUser() {
  await signOut(firebaseAuth());
}

// undefined means the person closed the popup themselves, so there is nothing to tell them.
const SIGN_IN_ERRORS = new Map<string, string | undefined>([
  ['auth/popup-closed-by-user', undefined],
  ['auth/cancelled-popup-request', undefined],
  ['auth/user-cancelled', undefined],
  ['auth/popup-blocked', 'Your browser blocked the Google window. Allow pop-ups for this site, then try again.'],
  ['auth/credential-already-in-use', 'That Google account already has a TakeOne account, so these guest videos cannot move to it. They stay in this guest session. Try a different Google account.'],
  ['auth/operation-not-allowed', 'This sign-in option is turned off right now.'],
  ['auth/admin-restricted-operation', 'This sign-in option is turned off right now.'],
  ['auth/unauthorized-domain', 'Sign-in does not work on this web address. Open TakeOne from its main address.'],
  ['auth/network-request-failed', 'Could not reach Google. Check your connection, then try again.'],
]);

export function signInErrorMessage(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && SIGN_IN_ERRORS.has(code) ? SIGN_IN_ERRORS.get(code) : 'Sign-in did not finish. Try again.';
}

function useAuthAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(undefined);
    try { await action(); }
    catch (caught) { setError(signInErrorMessage(caught)); }
    finally { setBusy(false); }
  };
  return { busy, error, run };
}

export function SignInChoices({ className = '' }: { className?: string }) {
  const { busy, error, run } = useAuthAction();
  return <div className={className}>
    <div className="flex flex-wrap justify-center gap-3">
      <button type="button" disabled={busy} onClick={() => void run(signInWithGoogle)} className={button('primary')}><GoogleLogo aria-hidden="true" size={16} weight="bold" />Continue with Google</button>
      <button type="button" disabled={busy} onClick={() => void run(continueAsGuest)} className={button('secondary')}><UserCircle aria-hidden="true" size={16} weight="regular" />Continue as guest</button>
    </div>
    <p className="mx-auto mt-4 max-w-sm text-xs text-muted">Guest videos stay in this browser until you save them with Google.</p>
    {error && <p role="alert" className="mx-auto mt-3 max-w-sm border-l-2 border-signal pl-2 text-left text-sm text-signal">{error}</p>}
  </div>;
}

export function GuestNotice({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { busy, error, run } = useAuthAction();
  if (!user?.isGuest) return null;
  return <section aria-label="Guest session" className={`border-y border-ink py-2 ${className}`}>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="stamp -rotate-3 px-2! py-0.5! text-[10px]! text-signal">Guest</span>
      <p className="min-w-0 flex-1 basis-48 text-sm text-ink2">Your videos stay in this browser until you save them with Google.</p>
      <button type="button" disabled={busy} onClick={() => void run(saveWithGoogle)} className={button('primary', 'sm')}><GoogleLogo aria-hidden="true" size={14} weight="bold" />Save with Google</button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-signal">{error}</p>}
  </section>;
}

export function useFirebaseConvexAuth() {
  const { user, loading } = useAuth();
  const fetchAccessToken = useCallback(async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    if (!user) return null;
    try { return await auth?.currentUser?.getIdToken(forceRefreshToken) ?? null; }
    catch { return null; }
  }, [user]);
  return useMemo(() => ({ isLoading: loading, isAuthenticated: !!user, fetchAccessToken }), [loading, user, fetchAccessToken]);
}
