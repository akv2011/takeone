// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { getFunctionName } from 'convex/server';
import { PACKS } from '../convex/config';
const mocks = vi.hoisted(() => ({ userId: 'u1' as string | undefined, redirect: vi.fn(), auth: { isAuthenticated: true, isLoading: false }, queryArgs: new Map<string, unknown>(), mutations: new Map<string, ReturnType<typeof vi.fn>>(), queries: new Map<string, unknown>(), action: vi.fn(), loadMore: vi.fn(), historyStatus: "Exhausted" }));
const authMocks = vi.hoisted(() => ({ guest: false, signInWithGoogle: vi.fn(), saveWithGoogle: vi.fn() }));
vi.mock('../src/lib/auth', () => ({
 SignedIn: ({ children }: any) => mocks.userId ? children : null, SignedOut: ({ children }: any) => mocks.userId ? null : children,
 SignInChoices: () => null, GuestNotice: () => null,
 useAuth: () => ({ user: mocks.userId ? { id: mocks.userId, isGuest: authMocks.guest, name: 'Test User' } : null, loading: false }),
 signInWithGoogle: authMocks.signInWithGoogle, saveWithGoogle: authMocks.saveWithGoogle, signOutUser: vi.fn(),
 signInErrorMessage: (error: { code?: string }) => error.code === 'auth/popup-closed-by-user' ? undefined : `Mapped ${error.code}`,
}));
beforeEach(() => {
 authMocks.guest = false;
 authMocks.signInWithGoogle.mockReset().mockResolvedValue(undefined);
 authMocks.saveWithGoogle.mockReset().mockResolvedValue(undefined);
});
vi.mock('convex/react', () => ({
 useConvexAuth: () => mocks.auth,
 usePaginatedQuery: (r: any, args: any) => { mocks.queryArgs.set(getFunctionName(r), args); return ({ results: args === "skip" ? [] : mocks.queries.get(getFunctionName(r)) ?? [], status: mocks.historyStatus, loadMore: mocks.loadMore }); },
 useQuery: (r: any, args: any) => { mocks.queryArgs.set(getFunctionName(r), args); return args === "skip" ? undefined : mocks.queries.get(`${getFunctionName(r)}:${args?.jobId}`) ?? mocks.queries.get(getFunctionName(r)); },
 useMutation: (r: any) => {
   const name = getFunctionName(r);
   if (!mocks.mutations.has(name)) mocks.mutations.set(name, vi.fn().mockResolvedValue({ jobId: 'new-job', billing: 'free', code: 'abcdefghijklmnopqrstuvwxyz', botUsername: 'Takeone_test_bot' }));
   return mocks.mutations.get(name);
 },
 useAction: () => mocks.action,
}));
vi.mock('../src/lib/openCheckout', () => ({ openCheckout: mocks.redirect }));
import Pricing from '../src/pages/Pricing';
import Dashboard from '../src/pages/Dashboard';
import Studio from '../src/pages/Studio';
beforeEach(() => {
 mocks.userId = 'u1'; mocks.redirect.mockReset();
 sessionStorage.clear(); mocks.historyStatus = "Exhausted"; mocks.loadMore.mockReset();
 mocks.auth = { isAuthenticated: true, isLoading: false }; mocks.queryArgs.clear();
 mocks.mutations.clear(); mocks.queries.clear(); mocks.action.mockReset().mockResolvedValue({ url: 'https://storage.googleapis.com/fresh-video.mp4' });
 mocks.queries.set('telegram:status', { configured: true, linked: false, botUsername: 'Takeone_test_bot' });
 mocks.queries.set('generate:capabilities', { rendering: { available: true }, stockVideo: { available: true }, youtubeClips: { available: true }, aiVideo: { available: true }, telegram: { available: true, username: 'Takeone_test_bot' }, payments: { available: true }, music: { available: true } });
 mocks.queries.set('credits:getPacks', PACKS);
 mocks.queries.set('users:currentUser', { freeRemaining: 3, credits: 0, canGenerate: true, preferences: { defaultMode: 'generate', defaultAspect: '9:16', defaultCaptionStyle: 'auto', openFinishedInStudio: true, showShortcutHints: true } });
 mocks.queries.set('generate:listJobs', []);
});
afterEach(cleanup);
const show = (component: React.ReactElement) => render(React.createElement(MemoryRouter, {}, component));
test('AI scenes submit explicitly and cannot select square output', async () => {
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Generate', exact: true }));
 fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
 fireEvent.click(screen.getByRole('button', { name: '1:1', exact: true }));
 fireEvent.change(screen.getByLabelText('Video type'), { target: { value: 'ai' } });
 expect((screen.getByRole('button', { name: '1:1', exact: true }) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'A cinematic mountain sunrise' } });
 fireEvent.click(screen.getByRole('button', { name: 'Create video', exact: true }));
 await waitFor(() => expect(mocks.mutations.get('generate:requestGeneration')).toHaveBeenCalledWith(expect.objectContaining({ mode: 'generate', generationKind: 'ai', aspect: '9:16' })));
});
test('pricing renders all three packs and five free videos', () => {
 show(React.createElement(Pricing));
 expect(screen.getByText('5 free generations')).toBeTruthy();
 expect(screen.getByText('5', { selector: 'p' }).textContent).toContain('videos');
 for (const amount of ['$9.99', '$25', '$99.99']) expect(screen.getByText(amount)).toBeTruthy();
 expect(screen.queryByText('Priority queue')).toBeNull();
});

test('pricing without a sign-in provider shows packs with checkout disabled and no account queries', () => {
 show(React.createElement(Pricing, { auth: false }));
 for (const amount of ['$9.99', '$25', '$99.99']) expect(screen.getByText(amount)).toBeTruthy();
 const buttons = screen.getAllByRole('button', { name: 'Checkout opening soon' });
 expect(buttons).toHaveLength(3);
 expect(buttons.every(button => (button as HTMLButtonElement).disabled)).toBe(true);
 expect(screen.queryByRole('button', { name: /^Buy / })).toBeNull();
 expect(mocks.queryArgs.has('payments:listHistory')).toBe(false);
});

test('a signed-out pack button signs in with Google and shows only errors worth reporting', async () => {
 mocks.userId = undefined;
 show(React.createElement(Pricing));
 const buttons = screen.getAllByRole('button', { name: 'Sign in to buy' });
 expect(buttons).toHaveLength(3);
 authMocks.signInWithGoogle.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
 await act(async () => { fireEvent.click(buttons[0]); });
 expect(authMocks.signInWithGoogle).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('alert')).toBeNull();
 authMocks.signInWithGoogle.mockRejectedValueOnce({ code: 'auth/popup-blocked' });
 await act(async () => { fireEvent.click(buttons[1]); });
 expect(screen.getByRole('alert').textContent).toBe('Mapped auth/popup-blocked');
});

test('a guest saves with Google before buying instead of starting a checkout', async () => {
 authMocks.guest = true;
 show(React.createElement(Pricing));
 expect(screen.queryByRole('button', { name: /^Buy / })).toBeNull();
 const save = screen.getAllByRole('button', { name: 'Save with Google to buy' });
 expect(save).toHaveLength(3);
 authMocks.saveWithGoogle.mockRejectedValueOnce({ code: 'auth/credential-already-in-use' });
 await act(async () => { fireEvent.click(save[0]); });
 expect(authMocks.saveWithGoogle).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('alert').textContent).toBe('Mapped auth/credential-already-in-use');
 expect(mocks.action).not.toHaveBeenCalled();
});

test('unconfigured providers stay visible as unavailable instead of starting broken work', () => {
 mocks.queries.set('generate:capabilities', { rendering: { available: false, reason: 'Video rendering is being connected.' }, stockVideo: { available: false, reason: 'Video rendering is being connected.' }, youtubeClips: { available: false, reason: 'YouTube clipping is being connected.' }, aiVideo: { available: false, reason: 'AI video generation is being connected.' }, telegram: { available: false, reason: 'Telegram is being connected.' }, payments: { available: false, reason: 'Checkout is not open yet.' }, music: { available: false, reason: 'Soundtracks are being connected.' } });
 const dashboard = show(React.createElement(Dashboard));
 expect((screen.getByRole('button', { name: 'Create video' }) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button', { name: 'Clip', exact: true }));
 expect(screen.getByRole('button', { name: 'Find moments' })).toBeTruthy();
 expect(screen.queryByRole('button', { name: 'Create clip' })).toBeNull();
 expect(screen.queryByText('YouTube clipping is being connected.')).toBeNull();
 for (const [mode, action] of [['Edit upload', 'Edit video'], ['Generate', 'Create video']]) {
  const tab = screen.getByRole('button', { name: mode, exact: true });
  expect((tab as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(tab);
  expect(tab.getAttribute('aria-pressed')).toBe('true');
  expect((screen.getByRole('button', { name: action }) as HTMLButtonElement).disabled).toBe(true);
 }
 expect(screen.getByText('Video rendering is being connected.')).toBeTruthy();
 expect(screen.queryByRole('button', { name: 'Telegram' })).toBeNull();
 dashboard.unmount();
 show(React.createElement(Pricing));
 expect(screen.getByText(/Checkout is not open yet/)).toBeTruthy();
 expect(screen.queryByText(/You can still use your free videos/)).toBeNull();
 expect(screen.getAllByRole('button', { name: 'Checkout opening soon' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
});

test.each([null, undefined, { status: 'pending', packId: 'starter', requestId: 'pending-attempt', credits: 25 }])('unverified or pending checkout returns preserve retry identities', order => {
 sessionStorage.setItem('takeone-checkout-starter', 'pending-attempt');
 sessionStorage.setItem('takeone-checkout-creator', 'other-attempt');
 mocks.queries.set('payments:orderStatus', order);
 render(React.createElement(MemoryRouter, { initialEntries: ['/pricing?order=aaaaaaaaaaaaaaaaaaaa'] }, React.createElement(Pricing)));
 expect(sessionStorage.getItem('takeone-checkout-starter')).toBe('pending-attempt');
 expect(sessionStorage.getItem('takeone-checkout-creator')).toBe('other-attempt');
});
test('a verified terminal return clears only its matching attempt, never a newer checkout', () => {
 sessionStorage.setItem('takeone-checkout-starter', 'paid-attempt');
 sessionStorage.setItem('takeone-checkout-creator', 'other-attempt');
 mocks.queries.set('payments:orderStatus', { status: 'paid', packId: 'starter', requestId: 'paid-attempt', credits: 25 });
 const view = render(React.createElement(MemoryRouter, { initialEntries: ['/pricing?order=aaaaaaaaaaaaaaaaaaaa'] }, React.createElement(Pricing)));
 expect(sessionStorage.getItem('takeone-checkout-starter')).toBeNull();
 expect(sessionStorage.getItem('takeone-checkout-creator')).toBe('other-attempt');
 view.unmount();
 sessionStorage.setItem('takeone-checkout-starter', 'newer-attempt');
 render(React.createElement(MemoryRouter, { initialEntries: ['/pricing?order=aaaaaaaaaaaaaaaaaaaa'] }, React.createElement(Pricing)));
 expect(sessionStorage.getItem('takeone-checkout-starter')).toBe('newer-attempt');
});
test('dashboard sends explicit aspect, mode, ownership and an idempotency key', async () => {
 mocks.queries.set('uploads:list', [{ _id: 'upload1', name: 'talk.mp4', size: 1048576 }]);
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Edit upload', exact: true }));
 fireEvent.change(screen.getByLabelText('Uploaded video'), { target: { value: 'upload1' } });
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'Trim 0:05 to 0:20 and add captions' } });
 fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
 fireEvent.click(screen.getByRole('button', { name: '1:1', exact: true }));
 fireEvent.click(screen.getByRole('button', { name: 'Edit video', exact: true }));
 expect(mocks.mutations.get('uploads:requestEdit')).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button', { name: 'Edit video', exact: true }));
 await waitFor(() => expect(mocks.mutations.get('uploads:requestEdit')).toHaveBeenCalledWith(expect.objectContaining({ uploadId: 'upload1', instruction: 'Trim 0:05 to 0:20 and add captions', aspect: '1:1', confirmedOwnership: true, requestId: expect.any(String) })));
 expect(mocks.mutations.get('generate:requestGeneration')).not.toHaveBeenCalled();
 expect(await screen.findByText(/one free video reserved/i)).toBeTruthy();
});
test('uncertain submission retries reuse the same request ID', async () => {
 const submit = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ jobId: 'new-job', billing: 'free' });
 mocks.mutations.set('generate:requestGeneration', submit);
 show(React.createElement(Dashboard));
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'A reel about space' } });
 const button = screen.getByRole('button', { name: 'Create video', exact: true });
 fireEvent.click(button); await screen.findByText(/Could not queue/);
 fireEvent.click(button); await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
 expect(submit.mock.calls[0][0].requestId).toBe(submit.mock.calls[1][0].requestId);
});
test('studio signs its video and edits by source ID rather than trusting a URL', async () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 await waitFor(() => expect(mocks.action).toHaveBeenCalledWith({ jobId: 'source-job' }));
 fireEvent.click(screen.getByRole('button', { name: 'Describe an edit', exact: true }));
 fireEvent.click(screen.getByRole('button', { name: 'Make it square (1:1)' }));
 await waitFor(() => expect(mocks.mutations.get('generate:requestEdit')).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'source-job', transforms: {aspect:'1:1',fit:'crop'}, requestId: expect.any(String) })));
 expect(mocks.mutations.get('generate:requestEdit')!.mock.calls[0][0]).not.toHaveProperty('sourceUrl');
});

test('an edit completing after navigation cannot pull the user back into Studio', async () => {
 let resolve!: (value: { jobId: string }) => void;
 const submit = vi.fn(() => new Promise<{ jobId: string }>(done => { resolve = done; }));
 mocks.mutations.set('generate:requestEdit', submit);
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {},
  React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }),
  React.createElement(Route, { path: '/create', element: React.createElement('h1', {}, 'Your dashboard') }),
 )));
 fireEvent.click(screen.getByRole('button', { name: 'Describe an edit', exact: true }));
 fireEvent.click(screen.getByRole('button', { name: 'Make it square (1:1)' }));
 expect(submit).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('link', { name: 'Your videos' }));
 expect(screen.getByRole('heading', { name: 'Your dashboard' })).toBeTruthy();
 await act(async () => { resolve({ jobId: 'new-job' }); });
 expect(screen.getByRole('heading', { name: 'Your dashboard' })).toBeTruthy();
 expect(submit).toHaveBeenCalledTimes(1);
});
test('connecting Telegram shows a one-use code and queued cancellation calls the durable API', async () => {
 mocks.queries.set('generate:listJobs', [{ _id: 'queued-job', mode: 'generate', status: 'queued', prompt: 'A reel about space' }]);
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Telegram' }));
 fireEvent.click(screen.getByRole('button', { name: 'Connect Telegram' }));
 expect(await screen.findByText(/Send \/link/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
 await waitFor(() => expect(mocks.mutations.get('generate:cancelJob')).toHaveBeenCalledWith({ jobId: 'queued-job' }));
});
test('dashboard keeps guidance in tooltips and reveals only the selected workflow', async () => {
 show(React.createElement(Dashboard));
 expect(screen.getByRole('heading', { name: 'Create a video' })).toBeTruthy();
 expect(screen.queryByText(/shared across the website and your linked Telegram account/)).toBeNull();
 expect(screen.getByRole('tooltip', { name: /Turn an idea into a narrated video/ })).toBeTruthy();
 expect(screen.queryByLabelText('Upload video')).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: 'Edit upload' }));
 expect(screen.getByLabelText('Upload video')).toBeTruthy();
 await waitFor(() => expect(mocks.mutations.get('users:ensureUser')).toHaveBeenCalledTimes(1));
 expect(mocks.mutations.get('generate:requestGeneration')).not.toHaveBeenCalled();
});
test('dashboard initializes saved preferences once and preserves later user choices', async () => {
 mocks.queries.set('users:currentUser', { freeRemaining: 3, credits: 0, canGenerate: true, preferences: { defaultMode: 'edit', defaultAspect: '16:9', defaultCaptionStyle: 'clean', openFinishedInStudio: false, showShortcutHints: false } });
 const view = show(React.createElement(Dashboard));
 await waitFor(() => expect(screen.getByRole('button', { name: 'Edit upload' }).getAttribute('aria-pressed')).toBe('true'));
 fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
 expect(screen.getByRole('button', { name: '16:9' }).getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByRole('button', { name: '16:9' }).className).toContain('bg-cue');
 expect((screen.getByLabelText('Caption style') as HTMLSelectElement).value).toBe('clean');
 expect(screen.queryByLabelText('Command plus Enter')).toBeNull();

 fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
 mocks.queries.set('users:currentUser', { freeRemaining: 2, credits: 0, canGenerate: true, preferences: { defaultMode: 'edit', defaultAspect: '1:1', defaultCaptionStyle: 'meme', openFinishedInStudio: true, showShortcutHints: true } });
 view.rerender(React.createElement(MemoryRouter, {}, React.createElement(Dashboard)));
 expect(screen.getByRole('button', { name: 'Generate' }).getAttribute('aria-pressed')).toBe('true');
 mocks.userId = 'u2';
 view.rerender(React.createElement(MemoryRouter, {}, React.createElement(Dashboard)));
 await waitFor(() => expect(screen.getByRole('button', { name: 'Edit upload' }).getAttribute('aria-pressed')).toBe('true'));
});
test('dashboard opens a newly finished render in Studio only when enabled', async () => {
 mocks.mutations.set('generate:requestGeneration', vi.fn().mockResolvedValue({ jobId: 'new-job', billing: 'free' }));
 mocks.queries.set('users:currentUser', { freeRemaining: 3, credits: 0, canGenerate: true, preferences: { defaultMode: 'generate', defaultAspect: '9:16', defaultCaptionStyle: 'auto', openFinishedInStudio: true, showShortcutHints: true } });
 const app = () => React.createElement(MemoryRouter, { initialEntries: ['/create'] }, React.createElement(Routes, {},
  React.createElement(Route, { path: '/create', element: React.createElement(Dashboard) }),
  React.createElement(Route, { path: '/studio/:id', element: React.createElement('h1', {}, 'Studio opened') }),
 ));
 const view = render(app());
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'A product launch film' } });
 fireEvent.click(screen.getByRole('button', { name: 'Create video' }));
 await waitFor(() => expect(mocks.mutations.get('generate:requestGeneration')).toHaveBeenCalled());
 expect(await screen.findByText(/One free video reserved/)).toBeTruthy();
 mocks.queries.set('generate:listJobs', [{ _id: 'new-job', mode: 'generate', status: 'done', prompt: 'A product launch film', hasOutput: true }]);
 view.rerender(app());
 expect(await screen.findByRole('heading', { name: 'Studio opened' })).toBeTruthy();
});
test('dashboard keeps a finished render on the reels page when auto-open is disabled', async () => {
 mocks.mutations.set('generate:requestGeneration', vi.fn().mockResolvedValue({ jobId: 'new-job', billing: 'free' }));
 mocks.queries.set('users:currentUser', { freeRemaining: 3, credits: 0, canGenerate: true, preferences: { defaultMode: 'generate', defaultAspect: '9:16', defaultCaptionStyle: 'auto', openFinishedInStudio: false, showShortcutHints: true } });
 const app = () => React.createElement(MemoryRouter, { initialEntries: ['/create'] }, React.createElement(Routes, {},
  React.createElement(Route, { path: '/create', element: React.createElement(Dashboard) }),
  React.createElement(Route, { path: '/studio/:id', element: React.createElement('h1', {}, 'Studio opened') }),
 ));
 const view = render(app());
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'A founder story' } });
 fireEvent.click(screen.getByRole('button', { name: 'Create video' }));
 expect(await screen.findByText(/One free video reserved/)).toBeTruthy();
 mocks.queries.set('generate:listJobs', [{ _id: 'new-job', mode: 'generate', status: 'done', prompt: 'A founder story', hasOutput: true }]);
 view.rerender(app());
 await waitFor(() => expect(screen.getByText('A founder story')).toBeTruthy());
 expect(screen.queryByRole('heading', { name: 'Studio opened' })).toBeNull();
});
test('account setup failure is visible and retryable while generation stays unavailable', async () => {
 mocks.queries.set('users:currentUser', null);
 const initialize = vi.fn().mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue({});
 mocks.mutations.set('users:ensureUser', initialize);
 show(React.createElement(Dashboard));
 expect((screen.getByRole('button', { name: 'Create video' }) as HTMLButtonElement).disabled).toBe(true);
 expect(await screen.findByRole('alert')).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Retry account setup' }));
 await waitFor(() => expect(initialize).toHaveBeenCalledTimes(2));
 await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
 expect(mocks.mutations.get('generate:requestGeneration')).not.toHaveBeenCalled();
});
test('private queries and account creation wait until backend authentication is ready', async () => {
 mocks.auth = { isAuthenticated: false, isLoading: true };
 const view = show(React.createElement(Dashboard));
 expect(mocks.queryArgs.get('generate:listJobs')).toBe('skip');
 expect(mocks.queryArgs.get('users:currentUser')).toBe('skip');
 expect(mocks.mutations.get('users:ensureUser')).not.toHaveBeenCalled();
 expect((screen.getByRole('button', { name: 'Create video' }) as HTMLButtonElement).disabled).toBe(true);
 mocks.auth = { isAuthenticated: true, isLoading: false };
 view.rerender(React.createElement(MemoryRouter, {}, React.createElement(Dashboard)));
 await waitFor(() => expect(mocks.mutations.get('users:ensureUser')).toHaveBeenCalledTimes(1));
 expect(mocks.queryArgs.get('generate:listJobs')).toEqual({ accountKey: 'u1' });
});
test('a failed sign-in bridge gives an actionable message without firing private queries', () => {
 mocks.auth = { isAuthenticated: false, isLoading: false };
 show(React.createElement(Dashboard));
 expect(screen.getByRole('alert').textContent).toContain('Reload the page to try again');
 expect(screen.getByRole('alert').textContent).not.toContain('Sign out');
 expect(mocks.queryArgs.get('generate:listJobs')).toBe('skip');
});
test('purchase history distinguishes started checkouts from confirmed credit purchases', () => {
 mocks.queries.set('payments:listHistory', [
  { id: 'first', packId: 'starter', credits: 25, amountUsd: 9.99, status: 'failed', createdAt: Date.now(), environment: 'test' },
  { id: 'second', packId: 'creator', credits: 100, amountUsd: 25, status: 'paid', createdAt: Date.now(), environment: 'live' },
 ]);
 show(React.createElement(Pricing));
 expect(screen.getByRole('heading', { name: 'Purchase history' })).toBeTruthy();
 expect(screen.getByText('Payment failed')).toBeTruthy();
 expect(screen.getByText('Payment confirmed')).toBeTruthy();
 expect(screen.getByText(/Test checkout/)).toBeTruthy();
 expect(screen.getByText(/A started checkout is not a charge/)).toBeTruthy();
});
test('checkout retries keep the same attempt ID across an uncertain response and page remount', async () => {
 sessionStorage.clear(); mocks.action.mockRejectedValue(new Error('connection lost'));
 const view = show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: 'Buy 25 credits' }));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button', { name: 'Buy 25 credits' }));
 await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
 const requestId = mocks.action.mock.calls[0][0].requestId;
 expect(requestId).toBeTruthy(); expect(mocks.action.mock.calls[1][0].requestId).toBe(requestId);
 view.unmount(); show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: 'Buy 25 credits' }));
 await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(3));
 expect(mocks.action.mock.calls[2][0].requestId).toBe(requestId);
 sessionStorage.clear();
});

test('studio previews only the selection, restores speed and submits the edit', async () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true });
 const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
 const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
 try {
  const view = render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
  await waitFor(() => expect(view.container.querySelector('video')).not.toBeNull());
  const video = view.container.querySelector('video')!;
  Object.defineProperty(video, 'duration', { value: 20, configurable: true });
  fireEvent.loadedMetadata(video);
  fireEvent.click(screen.getByText('Trim controls'));
  fireEvent.change(screen.getByLabelText('Start (seconds)'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('End (seconds)'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '2' } });
  fireEvent.click(screen.getByText('Preview selection'));
  expect(video.currentTime).toBe(2); expect(video.playbackRate).toBe(2); expect(play).toHaveBeenCalled();
  expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
  video.currentTime = 6; fireEvent.timeUpdate(video);
  expect(pause).toHaveBeenCalled(); expect(video.playbackRate).toBe(1);
  fireEvent.click(screen.getByText('Apply edit'));
  await waitFor(() => expect(mocks.mutations.get('generate:requestEdit')).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'source-job', transforms: { trim: { start: 2, end: 6 }, speed: 2, aspect: '9:16', fit: 'crop' } })));
 } finally { play.mockRestore(); pause.mockRestore(); }
});

test('failed edit can reopen its original without submitting another generation', async () => {
 mocks.queries.set('generate:getJob', { _id: 'failed-edit', status: 'failed', mode: 'edit', prompt: 'Trim video', hasSource: true });
 mocks.queries.set('generate:versions', [
  { _id: 'original', original: true, prompt: 'Space video', status: 'done', createdAt: 1 },
  { _id: 'failed-edit', parentJobId: 'original', original: false, prompt: 'Trim video', status: 'failed', createdAt: 2 },
 ]);
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/failed-edit'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 expect(screen.getByText(/This edit failed. Open a completed version/)).toBeTruthy();
 mocks.queries.set('generate:getJob', { _id: 'original', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true });
 fireEvent.click(screen.getByRole('link', { name: /Original/ }));
 await waitFor(() => expect(mocks.queryArgs.get('generate:getJob')).toEqual({ jobId: 'original' }));
 await waitFor(() => expect(mocks.action).toHaveBeenCalledWith({ jobId: 'original' }));
 expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
 expect(screen.getByRole('link', { name: /Original/ }).getAttribute('aria-current')).toBe('page');
});

test('purchase history checks an existing payment without opening another checkout', async () => {
 mocks.queries.set('payments:listHistory', [{ id: 'pending-order', credits: 25, packId: 'starter', amountUsd: 9.99, status: 'pending', createdAt: 1, environment: 'test' }]);
 mocks.action.mockResolvedValue({ status: 'paid' });
 show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
 expect(await screen.findByText('Payment verified. Your credits are available.')).toBeTruthy();
 expect(mocks.action).toHaveBeenCalledWith({ orderId: 'pending-order' });
 expect(mocks.action).toHaveBeenCalledTimes(1);
});

test('Studio authentication failure provides recovery and skips private queries', () => {
 mocks.auth = { isAuthenticated: false, isLoading: false };
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 expect(screen.getByRole('alert').textContent).toContain('Could not connect your sign-in');
 expect(mocks.queryArgs.get('generate:getJob')).toBe('skip');
 expect(mocks.queryArgs.get('generate:versions')).toBe('skip');
});
test.each([
 [null, 'This video is unavailable. Check the link or return to your dashboard.'],
 [{ _id: 'cancelled-job', status: 'cancelled', prompt: 'A reel', mode: 'generate' }, 'This generation was cancelled. Your allowance was restored.'],
])('Studio terminal state shows a concrete message', (job, message) => {
 mocks.queries.set('generate:getJob', job);
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 expect(screen.getByText(message)).toBeTruthy();
 expect(screen.queryByText('Loading…')).toBeNull();
});

test('soundtrack replacement requires an explicit choice and warns about speech removal', async () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true });
 mocks.queries.set('music:listTracks', [{ id: 'upbeat', label: 'Upbeat', attribution: 'Licensed test track' }]);
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 fireEvent.click(screen.getByRole('button', { name: 'Background music', exact: true }));
 fireEvent.change(screen.getByLabelText('Soundtrack'), { target: { value: 'upbeat' } });
 const replacement = screen.getByLabelText('Remove all original audio, including speech') as HTMLInputElement;
 expect(replacement.checked).toBe(false);
 fireEvent.click(replacement);
 expect(screen.getByText(/Speech, original music and sound effects will be removed/)).toBeTruthy();
 expect((screen.getByLabelText('Lower music while someone speaks') as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByText('Apply soundtrack'));
 await waitFor(() => expect(mocks.mutations.get('generate:requestEdit')).toHaveBeenCalledWith(expect.objectContaining({ music: expect.objectContaining({ trackId: 'upbeat', replaceSourceAudio: true }) })));
});

test('soundtrack preview loads audio without submitting a render', async () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true });
 mocks.queries.set('music:listTracks', [{ id: 'upbeat', label: 'Upbeat', attribution: 'Licensed test track' }]);
 const view = render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 fireEvent.click(screen.getByRole('button', { name: 'Background music', exact: true }));
 fireEvent.change(screen.getByLabelText('Soundtrack'), { target: { value: 'upbeat' } });
 fireEvent.click(screen.getByText('Preview soundtrack · free'));
 await waitFor(() => expect(view.container.querySelector('audio')).not.toBeNull());
 expect(mocks.action).toHaveBeenCalledWith({ trackId: 'upbeat' });
 expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
 fireEvent.error(view.container.querySelector('audio')!);
 expect(screen.getByText('Preview expired or unavailable. Load it again.')).toBeTruthy();
});

test('pricing explains refunded credits and outstanding adjustments before another purchase', () => {
 mocks.queries.set('users:currentUser', { credits: 0, creditAdjustment: 20 });
 mocks.queries.set('payments:listHistory', [{ id: 'refunded-order', credits: 25, packId: 'starter', amountUsd: 9.99, paidAmountUsd: 9.99, refundedAmountUsd: 9.99, refundedCredits: 25, status: 'refunded', createdAt: 1, environment: 'test' }]);
 show(React.createElement(Pricing));
 expect(screen.getByText(/A new pack first covers this adjustment/)).toBeTruthy();
 expect(screen.getByText('$9.99 refunded · 25 credits removed')).toBeTruthy();
 expect(screen.getByText('Refunded')).toBeTruthy();
 expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
});

test('caption choice is explicit in generation and hidden for AI scenes', async () => {
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Generate', exact: true }));
 fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
 fireEvent.change(screen.getByLabelText(/^Caption style/), { target: { value: 'clean' } });
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'Explain the solar system' } });
 fireEvent.click(screen.getByRole('button', { name: 'Create video', exact: true }));
 await waitFor(() => expect(mocks.mutations.get('generate:requestGeneration')).toHaveBeenCalledWith(expect.objectContaining({ captionStyle: 'clean' })));
 fireEvent.change(screen.getByLabelText('Video type'), { target: { value: 'ai' } });
 expect(screen.queryByLabelText(/^Caption style/)).toBeNull();
});

test('purchase history clearly exposes dispute review with an order reference', () => {
 mocks.queries.set('payments:listHistory', [{ id: 'review-order', credits: 25, amountUsd: 9.99, status: 'paid', disputeReview: true, createdAt: Date.now(), environment: 'test' }]);
 show(React.createElement(Pricing));
 expect(screen.getByText('Dispute review required')).toBeTruthy();
 expect(screen.getByText(/Keep this order reference: review-order/)).toBeTruthy();
});

test('Studio submits a caption-only version and preserves soundtrack attribution', async () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'A video', hasOutput: true, hasCaptionArchive: true, soundtrack: { label: 'Licensed track', attribution: 'Credit the artist' } });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 expect(screen.getByText(/Licensed track.*Credit the artist/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Caption style', exact: true }));
 fireEvent.change(screen.getByLabelText('New caption style'), { target: { value: 'none' } });
 fireEvent.click(screen.getByRole('button', { name: 'Apply style' }));
 await waitFor(() => expect(mocks.mutations.get('generate:requestCaptionEdit')).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'source-job', captionStyle: 'none', requestId: expect.any(String) })));
 expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
});
test('Studio does not offer caption replacement without a retained layer', () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'A video', hasOutput: true });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 fireEvent.click(screen.getByRole('button', { name: 'Caption style', exact: true }));
 expect(screen.queryByRole('button', { name: 'Apply style' })).toBeNull();
 expect(screen.getByText(/This version has no editable caption layer/)).toBeTruthy();
});

test('verified expiry retires only its cached attempt and waits for a new user click', async () => {
 sessionStorage.setItem('takeone-checkout-starter', 'expired-attempt');
 sessionStorage.setItem('takeone-checkout-creator', 'unrelated-attempt');
 mocks.action.mockRejectedValueOnce({ data: 'CHECKOUT_RETRY_ALLOWED' }).mockRejectedValue(new Error('connection lost'));
 show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: 'Buy 25 credits' }));
 await screen.findByText(/previous checkout expired without a payment/);
 expect(mocks.action).toHaveBeenCalledTimes(1);
 expect(sessionStorage.getItem('takeone-checkout-starter')).toBeNull();
 expect(sessionStorage.getItem('takeone-checkout-creator')).toBe('unrelated-attempt');
 fireEvent.click(screen.getByRole('button', { name: 'Buy 25 credits' }));
 await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
 expect(mocks.action.mock.calls[0][0].requestId).toBe('expired-attempt');
 expect(mocks.action.mock.calls[1][0].requestId).not.toBe('expired-attempt');
});

test.each([
 ['requires_customer_action', /Payment needs your approval/],
 ['requires_capture', /authorized but not captured/],
 ['partially_captured', /Only part of the payment was captured/],
])('purchase history explains %s without clearing the current attempt', (status, message) => {
 sessionStorage.setItem('takeone-checkout-starter', 'pending-attempt');
 mocks.queries.set('payments:listHistory', [{ id: 'action-order', packId: 'starter', credits: 25, amountUsd: 9.99, status, createdAt: Date.now(), environment: 'test' }]);
 show(React.createElement(Pricing));
 expect(screen.getByText(message)).toBeTruthy();
 expect(screen.getByText(/Order reference: action-order/)).toBeTruthy();
 expect(sessionStorage.getItem('takeone-checkout-starter')).toBe('pending-attempt');
 expect(mocks.action).not.toHaveBeenCalled();
});

test('continue checkout targets an existing order and preserves its retry identity', async () => {
 sessionStorage.setItem('takeone-checkout-starter', 'current-attempt');
 mocks.queries.set('payments:listHistory', [{ id: 'resume-order', canResume: true, packId: 'starter', credits: 25, amountUsd: 9.99, status: 'requires_customer_action', createdAt: Date.now(), environment: 'test' }]);
 mocks.action.mockRejectedValue({ data: 'CHECKOUT_NOT_RESUMABLE' });
 show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: 'Continue checkout' }));
 await screen.findByText(/This checkout could not be reopened/);
 expect(mocks.action).toHaveBeenCalledExactlyOnceWith({ orderId: 'resume-order' });
 expect(sessionStorage.getItem('takeone-checkout-starter')).toBe('current-attempt');
});

test('Studio loads caption wording for free and submits corrections with saved timing', async () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true, hasCaptionArchive: true });
 mocks.action.mockImplementation(async args => args.jobId === 'source-job' ? [{ start: 0, end: 1, text: 'Misspelled word' }] : { url: 'https://storage.test/video.mp4' });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 fireEvent.click(screen.getByRole('button', { name: 'Caption style', exact: true }));
 fireEvent.click(screen.getByText('Edit caption wording · free to load'));
 const field = await screen.findByLabelText(/Caption 1 · 0.00 to 1.00s/);
 expect(mocks.mutations.get('generate:requestCaptionEdit')).not.toHaveBeenCalled();
 fireEvent.change(field, { target: { value: '' } });
 expect((screen.getByText('Apply style') as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(field, { target: { value: 'Corrected word' } });
 fireEvent.change(screen.getByLabelText('Caption position'), { target: { value: 'top' } });
 fireEvent.change(screen.getByLabelText('Caption font'), { target: { value: 'serif' } });
 fireEvent.click(screen.getByText('Apply style'));
 await waitFor(() => expect(mocks.mutations.get('generate:requestCaptionEdit')).toHaveBeenCalledWith({ sourceJobId: 'source-job', captionStyle: 'clean', captionTexts: ['Corrected word'], captionPosition: 'top', captionFont: 'serif', requestId: expect.any(String) }));
});

test('Telegram onboarding names the configured bot and shows linked state', async () => {
 mocks.queries.set('telegram:status', { configured: true, linked: false, botUsername: 'Staging_video_bot' });
 const view = show(React.createElement(Dashboard));
 mocks.mutations.get('telegram:createLink')!.mockResolvedValue({ code: 'private-code', botUsername: 'Staging_video_bot' });
 fireEvent.click(screen.getByRole('button', { name: 'Telegram' }));
 fireEvent.click(screen.getByText('Connect Telegram'));
 await screen.findByText(/Send \/link private-code to @Staging_video_bot/);
 mocks.queries.set('telegram:status', { configured: true, linked: true, botUsername: 'Staging_video_bot' });
 view.rerender(React.createElement(MemoryRouter, {}, React.createElement(Dashboard)));
 expect(screen.getByText('Connected to @Staging_video_bot.')).toBeTruthy();
 expect(screen.queryByText(/Send \/link private-code/)).toBeNull();
 expect(screen.getByText('Disconnect Telegram')).toBeTruthy();
});

test('unconfigured Telegram cannot create a linking code', () => {
 mocks.queries.set('telegram:status', { configured: false, linked: false });
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Telegram' }));
 expect(screen.getByText('Unavailable in this environment.')).toBeTruthy();
 fireEvent.click(screen.getByText('Connect Telegram'));
 expect(mocks.mutations.get('telegram:createLink')).not.toHaveBeenCalled();
});

test('dashboard can load older videos and displays pagination progress', () => {
 mocks.historyStatus = 'CanLoadMore';
 mocks.queries.set('generate:listJobs', [{ _id: 'job-1', mode: 'generate', status: 'queued', prompt: 'First page video' }]);
 const view = show(React.createElement(Dashboard));
 fireEvent.click(screen.getByText('Load older videos'));
 expect(mocks.loadMore).toHaveBeenCalledWith(20);
 mocks.historyStatus = 'LoadingMore';
 view.rerender(React.createElement(MemoryRouter, {}, React.createElement(Dashboard)));
 expect(screen.getByText('Loading older videos…')).toBeTruthy();
 expect(screen.queryByText('Load older videos')).toBeNull();
});

test('Studio retries failed Telegram delivery without submitting a render', async () => {
 mocks.queries.set('generate:getJob', { _id: 'finished-job', status: 'done', mode: 'generate', prompt: 'Finished video', hasOutput: true, telegramDeliveryStatus: 'failed' });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/finished-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 fireEvent.click(screen.getByText('Retry Telegram delivery · free'));
 await screen.findByText('Delivery retry queued. No generation used.');
 expect(mocks.mutations.get('telegramDelivery:retry')).toHaveBeenCalledExactlyOnceWith({ jobId: 'finished-job' });
 expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
 expect(mocks.mutations.get('generate:requestCaptionEdit')).not.toHaveBeenCalled();
});

test('studio seeks out of a speed preview and marks exact player time without charging', async () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true });
 const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
 const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
 try {
  const view = render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
  await waitFor(() => expect(view.container.querySelector('video')).not.toBeNull());
  const video = view.container.querySelector('video')!;
  Object.defineProperty(video, 'duration', { value: 20, configurable: true });
  fireEvent.loadedMetadata(video);
  fireEvent.click(screen.getByText('Trim controls'));
  fireEvent.change(screen.getByLabelText('Start (seconds)'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('End (seconds)'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '2' } });
  fireEvent.click(screen.getByText('Preview selection'));
  fireEvent.change(screen.getByLabelText('Seek video'), { target: { value: '8.125' } });
  expect(video.currentTime).toBe(8.125); expect(video.playbackRate).toBe(1); expect(pause).toHaveBeenCalled();
  pause.mockClear();
  video.currentTime = 9; fireEvent.timeUpdate(video);
  expect(pause).not.toHaveBeenCalled(); // Old preview end no longer pauses playback.
  video.currentTime = 9.375; // No timeupdate yet: marking must read the player directly.
  fireEvent.click(screen.getByText('Set start here'));
  video.currentTime = 12.125;
  fireEvent.click(screen.getByText('Set end here'));
  expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Apply edit'));
  await waitFor(() => expect(mocks.mutations.get('generate:requestEdit')).toHaveBeenCalledWith(expect.objectContaining({ transforms: { trim: { start: 9.375, end: 12.125 }, speed: 2, aspect: '9:16', fit: 'crop' } })));
 } finally { play.mockRestore(); pause.mockRestore(); }
});

test('Studio loads older edits without submitting and retains the original link', () => {
 mocks.queries.set('generate:getJob', { _id: 'edit', status: 'failed', mode: 'edit', prompt: 'Latest edit' });
 mocks.queries.set('generate:versions', [{ _id: 'original', original: true, prompt: 'Original video', status: 'done', createdAt: 1 }]);
 mocks.queries.set('generate:listVersions', [{ _id: 'edit', parentJobId: 'original', original: false, prompt: 'Latest edit', status: 'failed', createdAt: 2 }]);
 mocks.historyStatus = 'CanLoadMore';
 const view = render(React.createElement(MemoryRouter, { initialEntries: ['/studio/edit'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 expect(mocks.queryArgs.get('generate:versions')).toEqual({ jobId: 'edit', rootOnly: true, accountKey: 'u1' });
 expect(mocks.queryArgs.get('generate:listVersions')).toEqual({ jobId: 'edit', accountKey: 'u1' });
 fireEvent.click(screen.getByText('Load older edits'));
 expect(mocks.loadMore).toHaveBeenCalledWith(20);
 expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
 expect(screen.getByRole('link', { name: /Original/ })).toBeTruthy();
 mocks.historyStatus = 'LoadingMore';
 view.rerender(React.createElement(MemoryRouter, { initialEntries: ['/studio/edit'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 expect((screen.getByText('Loading older edits…') as HTMLButtonElement).disabled).toBe(true);
});

test('purchase history loads older records without starting or refreshing checkout', () => {
 mocks.queries.set('payments:listHistory', [{ id: 'old-order', packId: 'starter', credits: 25, amountUsd: 9.99, status: 'paid', createdAt: 1, environment: 'test' }]);
 mocks.historyStatus = 'CanLoadMore';
 const view = show(React.createElement(Pricing));
 expect(mocks.queryArgs.get('payments:listHistory')).toEqual({ accountKey: 'u1' });
 fireEvent.click(screen.getByText('Load older purchases'));
 expect(mocks.loadMore).toHaveBeenCalledWith(20); expect(mocks.action).not.toHaveBeenCalled();
 mocks.historyStatus = 'LoadingMore';
 view.rerender(React.createElement(MemoryRouter, {}, React.createElement(Pricing)));
 expect((screen.getByText('Loading older purchases…') as HTMLButtonElement).disabled).toBe(true);
 mocks.auth = { isAuthenticated: false, isLoading: false };
 view.rerender(React.createElement(MemoryRouter, {}, React.createElement(Pricing)));
 expect(mocks.queryArgs.get('payments:listHistory')).toBe('skip');
 expect(screen.queryByText('Purchase history')).toBeNull();
});

test.each(['create', 'resume'])('late %s checkout response cannot redirect after leaving the page', async kind => {
 let resolve!: (value: { url: string }) => void;
 mocks.action.mockReturnValue(new Promise(r => { resolve = r; }));
 if (kind === 'resume') mocks.queries.set('payments:listHistory', [{ id: 'pending-order', canResume: true, packId: 'starter', credits: 25, amountUsd: 9.99, status: 'pending', createdAt: 1, environment: 'test' }]);
 const view = show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: kind === 'create' ? 'Buy 25 credits' : 'Continue checkout' }));
 expect(mocks.action).toHaveBeenCalledTimes(1);
 view.unmount();
 await act(async () => { resolve({ url: 'https://test.checkout.dodopayments.com/old-session' }); });
 expect(mocks.redirect).not.toHaveBeenCalled();
});
test('changing account cancels a pending checkout redirect and releases the new account UI', async () => {
 let resolve!: (value: { url: string }) => void;
 mocks.action.mockReturnValueOnce(new Promise(r => { resolve = r; }));
 const view = show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: 'Buy 25 credits' }));
 mocks.userId = 'u2';
 view.rerender(React.createElement(MemoryRouter, {}, React.createElement(Pricing)));
 await act(async () => { resolve({ url: 'https://test.checkout.dodopayments.com/user-one-session' }); });
 expect(mocks.redirect).not.toHaveBeenCalled();
 expect((screen.getByRole('button', { name: 'Buy 25 credits' }) as HTMLButtonElement).disabled).toBe(false);
 mocks.action.mockResolvedValue({ url: 'https://test.checkout.dodopayments.com/user-two-session' });
 fireEvent.click(screen.getByRole('button', { name: 'Buy 25 credits' }));
 await waitFor(() => expect(mocks.redirect).toHaveBeenCalledWith('https://test.checkout.dodopayments.com/user-two-session'));
});

test.each(['create', 'resume'])('active %s checkout still redirects to the returned session', async kind => {
 mocks.action.mockResolvedValue({ url: 'https://test.checkout.dodopayments.com/current-session' });
 if (kind === 'resume') mocks.queries.set('payments:listHistory', [{ id: 'active-order', canResume: true, packId: 'starter', credits: 25, amountUsd: 9.99, status: 'pending', createdAt: 1, environment: 'test' }]);
 show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: kind === 'create' ? 'Buy 25 credits' : 'Continue checkout' }));
 await waitFor(() => expect(mocks.redirect).toHaveBeenCalledWith('https://test.checkout.dodopayments.com/current-session'));
});
test('a late failed checkout cannot clear the retry identity after leaving the page', async () => {
 let reject!: (reason: unknown) => void;
 mocks.action.mockReturnValue(new Promise((_, r) => { reject = r; }));
 const view = show(React.createElement(Pricing));
 fireEvent.click(screen.getByRole('button', { name: 'Buy 25 credits' }));
 const saved = sessionStorage.getItem('takeone-checkout-starter');
 expect(saved).toBeTruthy();
 view.unmount();
 await act(async () => { reject({ data: 'CHECKOUT_RETRY_ALLOWED' }); });
 expect(sessionStorage.getItem('takeone-checkout-starter')).toBe(saved);
 expect(mocks.redirect).not.toHaveBeenCalled();
});

test.each([
 ['USE_CAPTION_CONTROLS', 'Use the caption controls below'],
 ['NO_CREDITS', "You're out of credits"],
])('Studio explains the %s admission error without claiming an edit was queued', async (code, message) => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'A video', hasOutput: true });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 mocks.mutations.get('generate:requestEdit')!.mockRejectedValue({ data: code });
 fireEvent.click(screen.getByRole('button', { name: 'Describe an edit', exact: true }));
 fireEvent.change(screen.getByPlaceholderText('Describe an edit…'), { target: { value: 'make captions bold' } });
 fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }));
 await screen.findByText(new RegExp(message));
 expect(screen.queryByText('Your edit is queued. It will appear here when ready.')).toBeNull();
});


test.each(['queued', 'processing', 'failed'])('Studio keeps the owned parent playable during %s without allowing pending-source edits', async status => {
 mocks.queries.set('generate:getJob', { _id: 'pending', parentJobId: 'parent', status, mode: 'edit', prompt: 'Make it square', aspect: '1:1' });
 mocks.queries.set('generate:getJob:parent', { _id: 'parent', status: 'done', mode: 'generate', prompt: 'Original', hasOutput: true });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/pending'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 expect(await screen.findByLabelText('Previous completed version')).toBeTruthy();
 expect(screen.getByRole('link', { name: 'Open previous version' }).getAttribute('href')).toBe('/studio/parent');
 fireEvent.click(screen.getByRole('button', { name: 'Describe an edit', exact: true }));
 expect((screen.getByRole('button', { name: 'Edit', exact: true }) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByLabelText('Describe an edit') as HTMLInputElement).disabled).toBe(true);
 expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
});

test('Studio previews framing locally and submits structured values without instruction wording', async () => {
 mocks.queries.set('generate:getJob', { _id:'source-job',status:'done',mode:'edit',prompt:'A video',aspect:'9:16',hasOutput:true });
 const view=render(React.createElement(MemoryRouter,{initialEntries:['/studio/source-job']},React.createElement(Routes,{},React.createElement(Route,{path:'/studio/:id',element:React.createElement(Studio)}))));
 const video=await screen.findByLabelText('Current video');
 fireEvent.change(screen.getByLabelText('Output ratio'),{target:{value:'16:9'}});
 fireEvent.change(screen.getByLabelText('Frame sizing'),{target:{value:'fit'}});
 expect((view.container.querySelector('.studio-video') as HTMLElement).style.aspectRatio).toBe('16 / 9');
 expect((video as HTMLVideoElement).style.objectFit).toBe('contain');
 expect(mocks.mutations.get('generate:requestEdit')).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Apply framing'));
 await waitFor(()=>expect(mocks.mutations.get('generate:requestEdit')).toHaveBeenCalledWith({sourceJobId:'source-job',transforms:{aspect:'16:9',fit:'fit'},music:undefined,requestId:expect.any(String)}));
});

test('framing selection resets to the opened version and late structured requests cannot navigate back', async () => {
 let resolve!: (value:{jobId:string})=>void;
 const submit=vi.fn(()=>new Promise<{jobId:string}>(done=>{resolve=done;}));
 mocks.mutations.set('generate:requestEdit',submit);
 mocks.queries.set('generate:getJob',{_id:'source-job',status:'done',mode:'edit',prompt:'A video',aspect:'9:16',hasOutput:true});
 mocks.queries.set('generate:getJob:other',{_id:'other',status:'done',mode:'edit',prompt:'Other version',aspect:'1:1',hasOutput:true});
 mocks.queries.set('generate:versions',[{_id:'other',prompt:'Other version',status:'done',original:true,createdAt:1}]);
 render(React.createElement(MemoryRouter,{initialEntries:['/studio/source-job']},React.createElement(Routes,{},React.createElement(Route,{path:'/studio/:id',element:React.createElement(Studio)}))));
 fireEvent.change(screen.getByLabelText('Output ratio'),{target:{value:'16:9'}});
 fireEvent.click(screen.getByText('Apply framing'));
 fireEvent.click(screen.getByRole('link',{name:/Original/}));
 await waitFor(()=>expect((screen.getByLabelText('Output ratio') as HTMLSelectElement).value).toBe('1:1'));
 await act(async()=>{resolve({jobId:'late-job'});});
 await waitFor(()=>expect(mocks.queryArgs.get('generate:getJob')).toEqual({jobId:'other'}));
 expect(screen.queryByText('Your edit is queued. It will appear here when ready.')).toBeNull();
});


test('conversational edits retain the instruction API without adding transforms', async () => {
 mocks.queries.set('generate:getJob',{_id:'source-job',status:'done',mode:'edit',prompt:'A video',hasOutput:true});
 render(React.createElement(MemoryRouter,{initialEntries:['/studio/source-job']},React.createElement(Routes,{},React.createElement(Route,{path:'/studio/:id',element:React.createElement(Studio)}))));
 fireEvent.click(screen.getByRole('button', { name: 'Describe an edit', exact: true }));
 fireEvent.change(screen.getByLabelText('Describe an edit'),{target:{value:'Add my studio watermark'}});
 fireEvent.click(screen.getByRole('button',{name:'Edit',exact:true}));
 await waitFor(()=>expect(mocks.mutations.get('generate:requestEdit')).toHaveBeenCalledWith({sourceJobId:'source-job',instruction:'Add my studio watermark',music:undefined,requestId:expect.any(String)}));
});


test('a structured edit response from the previous account cannot navigate the new account', async () => {
 let resolve!: (value:{jobId:string})=>void;
 const submit=vi.fn(()=>new Promise<{jobId:string}>(done=>{resolve=done;}));
 mocks.mutations.set('generate:requestEdit',submit);
 mocks.queries.set('generate:getJob',{_id:'source-job',status:'done',mode:'edit',prompt:'First account video',aspect:'9:16',hasOutput:true});
 const page=()=>React.createElement(MemoryRouter,{initialEntries:['/studio/source-job']},React.createElement(Routes,{},React.createElement(Route,{path:'/studio/:id',element:React.createElement(Studio)})));
 const view=render(page());
 fireEvent.change(screen.getByLabelText('Output ratio'),{target:{value:'16:9'}});
 fireEvent.click(screen.getByText('Apply framing'));
 expect(submit).toHaveBeenCalledOnce();
 mocks.userId='second-account';
 mocks.queries.set('generate:getJob',null);
 view.rerender(page());
 await act(async()=>{resolve({jobId:'first-account-edit'});});
 expect(mocks.queryArgs.get('generate:getJob')).toEqual({jobId:'source-job'});
 expect(screen.getByText('This video is unavailable. Check the link or return to your dashboard.')).toBeTruthy();
 expect(screen.queryByText('Your edit is queued. It will appear here when ready.')).toBeNull();
});

test('dashboard includes selected brand revision in new renders and choosing it is free', async () => {
 mocks.queries.set('brandKits:list', [{ _id: 'kit-1', name: 'Soap studio', revision: 2, settings: { font: 'serif', captionStyle: 'meme', textColor: '#FFFFFF', outlineColor: '#000000' } }]);
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
 fireEvent.change(screen.getByLabelText('Saved brand kit'), { target: { value: 'kit-1' } });
 expect(mocks.mutations.get('generate:requestGeneration')).not.toHaveBeenCalled();
 expect(screen.queryByLabelText('Caption style')).toBeNull();
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'A detailed soap tutorial' } });
 fireEvent.click(screen.getByRole('button', { name: 'Create video', exact: true }));
 await waitFor(() => expect(mocks.mutations.get('generate:requestGeneration')).toHaveBeenCalledWith(expect.objectContaining({ brandKit: { kitId: 'kit-1', revision: 2 }, requestId: expect.any(String) })));
});

test('letting Gemini pick the moment sends an upload clip without a prompt', async () => {
 mocks.queries.set('uploads:list', [{ _id: 'upload1', name: 'talk.mp4', size: 1048576 }]);
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Edit upload' }));
 fireEvent.change(screen.getByLabelText('Uploaded video'), { target: { value: 'upload1' } });
 fireEvent.click(screen.getByRole('checkbox'));
 expect((screen.getByRole('radio', { name: 'Describe the edit' }) as HTMLInputElement).checked).toBe(true);
 fireEvent.click(screen.getByRole('button', { name: 'Edit video', exact: true }));
 expect(screen.getByText('Type a prompt to start.')).toBeTruthy();
 fireEvent.click(screen.getByRole('radio', { name: 'Let Gemini pick the best moment' }));
 expect((screen.getByRole('textbox', { name: 'Video prompt' }) as HTMLTextAreaElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button', { name: 'Create clip', exact: true }));
 const submit = mocks.mutations.get('uploads:requestEdit')!;
 await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
 expect(submit.mock.calls[0][0]).toMatchObject({ mode: 'clip', uploadId: 'upload1', confirmedOwnership: true, requestId: expect.any(String) });
 expect('instruction' in submit.mock.calls[0][0]).toBe(false);
});

test('caption language is sent only when chosen and stays with a brand kit', async () => {
 mocks.queries.set('brandKits:list', [{ _id: 'kit-1', name: 'Soap studio', revision: 2, settings: { font: 'serif', captionStyle: 'meme', textColor: '#FFFFFF', outlineColor: '#000000' } }]);
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
 const create = () => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'A reel about monsoon street food' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create video', exact: true }));
 };
 const submit = mocks.mutations.get('generate:requestGeneration')!;
 create();
 await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
 expect(submit.mock.calls[0][0].captionLanguage).toBeUndefined();
 fireEvent.change(screen.getByLabelText('Caption language'), { target: { value: 'hi' } });
 create();
 await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
 expect(submit.mock.calls[1][0]).toMatchObject({ mode: 'generate', captionLanguage: 'hi' });
 fireEvent.change(screen.getByLabelText('Saved brand kit'), { target: { value: 'kit-1' } });
 expect(screen.queryByLabelText('Caption style')).toBeNull();
 expect((screen.getByLabelText('Caption language') as HTMLSelectElement).value).toBe('hi');
 fireEvent.change(screen.getByLabelText('Video type'), { target: { value: 'ai' } });
 expect(screen.queryByLabelText('Caption language')).toBeNull();
});

test('a used-up free day shows the daily cap message', async () => {
 mocks.mutations.set('generate:requestGeneration', vi.fn().mockRejectedValue({ data: { code: 'FREE_DAILY_CAP', message: "Today's free renders are used up. Try again tomorrow. No allowance was used." } }));
 show(React.createElement(Dashboard));
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'A reel about space' } });
 fireEvent.click(screen.getByRole('button', { name: 'Create video', exact: true }));
 expect(await screen.findByText("Today's free renders are used up. Try again tomorrow.")).toBeTruthy();
});

test('a used-up AI day shows the AI cap message', async () => {
 mocks.mutations.set('generate:requestGeneration', vi.fn().mockRejectedValue({ data: { code: 'AI_DAILY_CAP', message: "Today's AI video renders are used up. Try again tomorrow, or make a stock or upload video. No allowance was used." } }));
 show(React.createElement(Dashboard));
 fireEvent.change(screen.getByRole('textbox', { name: 'Video prompt' }), { target: { value: 'A reel about space' } });
 fireEvent.click(screen.getByRole('button', { name: 'Create video', exact: true }));
 expect(await screen.findByText("Today's AI video renders are used up. Try again tomorrow, or make a stock or upload video.")).toBeTruthy();
});

test('studio shows the claims panel for a finished video that has a claims result', async () => {
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true,
  claims: { status: 'checked', claims: [{ text: 'The Moon orbits Earth.', verdict: 'supported', reason: 'NASA says so.', sources: [], searches: [] }] } });
 const view = render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 fireEvent.click(screen.getByRole('button', { name: 'Check claims', exact: true }));
 expect(await screen.findByRole('heading', { name: 'Claims' })).toBeTruthy();
 expect(screen.getByText('Supported')).toBeTruthy();
 view.unmount();
 mocks.queries.set('generate:getJob', { _id: 'source-job', status: 'done', mode: 'generate', prompt: 'Space video', hasOutput: true, claims: null });
 render(React.createElement(MemoryRouter, { initialEntries: ['/studio/source-job'] }, React.createElement(Routes, {}, React.createElement(Route, { path: '/studio/:id', element: React.createElement(Studio) }))));
 await screen.findByRole('heading', { name: 'Space video' });
 expect(screen.queryByRole('button', { name: 'Check claims', exact: true })).toBeNull();
 expect(screen.queryByRole('heading', { name: 'Claims' })).toBeNull();
});

test('with stock footage unavailable and AI video available, Generate starts on AI video', () => {
 mocks.queries.set('generate:capabilities', { rendering: { available: true }, stockVideo: { available: false, reason: 'Stock video generation is being connected.' }, youtubeClips: { available: false, reason: 'YouTube clipping is being connected.' }, aiVideo: { available: true }, telegram: { available: false, reason: 'Telegram is being connected.' }, payments: { available: false, reason: 'Checkout is not open yet.' }, music: { available: false, reason: 'Soundtracks are being connected.' } });
 show(React.createElement(Dashboard));
 fireEvent.click(screen.getByRole('button', { name: 'Generate', exact: true }));
 fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
 expect((screen.getByRole('combobox', { name: 'Video type' }) as HTMLSelectElement).value).toBe('ai');
 expect(screen.queryByText('Stock video generation is being connected.')).toBeNull();
});
