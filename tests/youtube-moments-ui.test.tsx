// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getFunctionName } from 'convex/server';

const mocks = vi.hoisted(() => {
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  return {
    calls,
    queries: new Map<string, unknown>(),
    queryArgs: new Map<string, unknown>(),
    fn: (name: string) => {
      if (!calls.has(name)) calls.set(name, vi.fn().mockResolvedValue({ jobId: 'new-job', billing: 'free' }));
      return calls.get(name)!;
    },
  };
});
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  usePaginatedQuery: () => ({ results: [], status: 'Exhausted', loadMore: vi.fn() }),
  useQuery: (ref: any, args: any) => {
    const name = getFunctionName(ref);
    mocks.queryArgs.set(name, args);
    return args === 'skip' ? undefined : mocks.queries.get(name);
  },
  useMutation: (ref: any) => mocks.fn(getFunctionName(ref)),
  useAction: (ref: any) => mocks.fn(getFunctionName(ref)),
}));
vi.mock('../src/lib/auth', () => ({
  SignedIn: ({ children }: any) => children, SignedOut: () => null, SignInChoices: () => null, GuestNotice: () => null,
  useAuth: () => ({ user: { id: 'u1', isGuest: false, name: 'Test User' }, loading: false }),
  signInWithGoogle: vi.fn(), saveWithGoogle: vi.fn(), signOutUser: vi.fn(), signInErrorMessage: () => undefined,
}));
vi.mock('../src/lib/convexApi', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/convexApi')>(), convexEnabled: true }));

type FakePlayer = { iframe: HTMLIFrameElement; events: { onStateChange: (event: { data: number }) => void; onError: (event: { data: number }) => void }; time: number };
const yt = vi.hoisted(() => {
  const players: FakePlayer[] = [];
  class Player {
    iframe: HTMLIFrameElement; events: FakePlayer['events']; time = 0;
    constructor(iframe: HTMLIFrameElement, options: { events: FakePlayer['events'] }) { this.iframe = iframe; this.events = options.events; players.push(this); }
    getCurrentTime() { return this.time; }
  }
  return { players, Player };
});
(window as any).YT = { Player: yt.Player };

import Dashboard from '../src/pages/Dashboard';
import { AppRoutes } from '../src/AppRoutes';
import { YouTubeMomentResults } from '../src/components/YouTubeMoments';
import { momentHandOff } from '../src/lib/momentHandOff';
import { metadataFor } from '../src/seo/metadata';

const token = 'a'.repeat(32);
const moments = [
  { start_sec: 83.4, end_sec: 117.2, hook: 'He actually said it', why: 'A setup and a payoff inside 35 seconds.', cues: [{ start_sec: 83, text: 'First line' }, { start_sec: 90.5, text: 'Second line' }, { start_sec: 101, text: 'Third line' }] },
  { start_sec: 290, end_sec: 334.5, hook: 'The late reveal', why: 'The answer lands at the end.', cues: [{ start_sec: 291, text: 'Late line' }] },
  { start_sec: 10, end_sec: 40, hook: 'Cold open', why: 'It starts mid-action.', cues: [{ start_sec: 10, text: 'Open line' }] },
];
const done = (extra: object = {}) => ({ id: 'analysis1', videoId: 'dQw4w9WgXcQ', createdAt: 1, status: 'done', moments, translations: [], ...extra });
const card = (hook: string) => screen.getByRole('article', { name: hook });
const playerFor = (article: HTMLElement) => yt.players.find(player => player.iframe === article.querySelector('iframe'))!;
const openYouTubeTab = () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Clip', exact: true }));
};
const openClip = (id: string) => render(<MemoryRouter initialEntries={[`/clip/${id}`]}><AppRoutes /></MemoryRouter>);

beforeEach(() => {
  mocks.calls.clear(); mocks.queries.clear(); mocks.queryArgs.clear(); yt.players.length = 0;
  mocks.queries.set('users:currentUser', { freeRemaining: 3, credits: 0, canGenerate: true, preferences: { defaultMode: 'generate', defaultAspect: '9:16', defaultCaptionStyle: 'auto', openFinishedInStudio: false, showShortcutHints: false } });
  mocks.queries.set('generate:capabilities', { rendering: { available: true }, stockVideo: { available: true }, youtubeClips: { available: false, reason: 'YouTube clipping is being connected.' }, aiVideo: { available: true }, telegram: { available: false }, payments: { available: true }, music: { available: true } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

test('the YouTube tab offers the link form instead of the download flow', () => {
  openYouTubeTab();
  expect(screen.getByRole('textbox', { name: 'YouTube link' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Find moments' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create clip' })).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  expect(screen.queryByText('YouTube clipping is being connected.')).toBeNull();
});

test('playlist and non-YouTube links are refused without calling Gemini', () => {
  openYouTubeTab();
  const input = screen.getByRole('textbox', { name: 'YouTube link' });
  fireEvent.change(input, { target: { value: 'https://www.youtube.com/playlist?list=PL0123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find moments' }));
  expect(screen.getByRole('alert').textContent).toBe('That link opens a playlist. Paste a link to one video.');
  fireEvent.change(input, { target: { value: 'https://vimeo.com/12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find moments' }));
  expect(screen.getByRole('alert').textContent).toBe('Paste a link to one YouTube video: youtube.com/watch, youtu.be or youtube.com/shorts.');
  expect(input.getAttribute('aria-describedby')!.split(' ')).toContain(screen.getByRole('alert').id);
  expect(mocks.calls.get('youtubeMoments:analyze')).not.toHaveBeenCalled();
});

test('a video link calls analyze with the url and explains the hourly limit', async () => {
  openYouTubeTab();
  const analyze = mocks.calls.get('youtubeMoments:analyze')!;
  analyze.mockRejectedValueOnce({ data: 'YOUTUBE_RATE_LIMIT' });
  fireEvent.change(screen.getByRole('textbox', { name: 'YouTube link' }), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find moments' }));
  expect(analyze).toHaveBeenCalledWith({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  expect((screen.getByRole('button', { name: 'Find moments' }) as HTMLButtonElement).disabled).toBe(true);
  expect(await screen.findByText('You can find moments 3 times an hour. Try again later.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Find moments' }) as HTMLButtonElement).disabled).toBe(false);
});

test('a running search shows progress and placeholders, a failed one says what to do', () => {
  mocks.queries.set('youtubeMoments:latest', { id: 'analysis1', videoId: 'dQw4w9WgXcQ', createdAt: 1, status: 'running' });
  const view = render(<YouTubeMomentResults />);
  expect(screen.getByRole('status').textContent).toBe('Gemini is watching the video. This usually takes under a minute.');
  const placeholders = view.container.querySelectorAll('[class*="aspect-[9/16]"]');
  expect(placeholders).toHaveLength(3);
  for (const placeholder of placeholders) expect(placeholder.className).toContain('motion-safe:animate-pulse');
  mocks.queries.set('youtubeMoments:latest', { id: 'analysis1', videoId: 'dQw4w9WgXcQ', createdAt: 1, status: 'failed' });
  view.rerender(<YouTubeMomentResults />);
  expect(screen.getByRole('status').textContent).toBe('Gemini could not find moments in this video. Check that it is public, then try another link.');
});

test('finished moments render the official player alone in its box with captions below it', () => {
  mocks.queries.set('youtubeMoments:latest', done());
  render(<YouTubeMomentResults onRender={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Moments from this video' })).toBeTruthy();
  expect(screen.getAllByRole('article')).toHaveLength(3);
  const first = card('He actually said it');
  expect(within(first).getByText('1:23 to 1:58 · 35 s')).toBeTruthy();
  const iframe = first.querySelector('iframe')!;
  const src = new URL(iframe.src);
  expect([src.host, src.pathname]).toEqual(['www.youtube-nocookie.com', '/embed/dQw4w9WgXcQ']);
  expect(Object.fromEntries(src.searchParams)).toEqual({ start: '83', end: '118', rel: '0', enablejsapi: '1', playsinline: '1', origin: window.location.origin });
  expect(iframe.title).toBe('YouTube video player: He actually said it');
  expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
  expect(iframe.hasAttribute('allowfullscreen')).toBe(true);
  expect(iframe.className).toBe('h-full w-full');
  const box = iframe.parentElement!;
  expect([...box.childNodes]).toEqual([iframe]);
  expect(box.className).toBe('aspect-video min-h-[200px] w-full shrink-0 bg-ink');
  const captions = within(first).getByRole('list', { name: 'Captions' });
  expect(iframe.compareDocumentPosition(captions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(captions).getAllByRole('listitem').map(line => line.textContent)).toEqual(['1:23First line', '1:30Second line', '1:41Third line']);
  expect(captions.querySelector('[aria-current]')).toBeNull();
});

test('playback highlights the current caption line and follows the player time', async () => {
  vi.useFakeTimers();
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  mocks.queries.set('youtubeMoments:latest', done());
  render(<StrictMode><YouTubeMomentResults /></StrictMode>);
  await act(async () => {});
  expect(yt.players).toHaveLength(3);
  const first = card('He actually said it');
  const player = playerFor(first);
  const current = () => within(first).getByRole('list', { name: 'Captions' }).querySelector('[aria-current="true"]');
  player.time = 91;
  act(() => player.events.onStateChange({ data: 1 }));
  expect(current()?.textContent).toBe('1:30Second line');
  expect(current()?.className).toContain('bg-cue');
  player.time = 101.2;
  act(() => { vi.advanceTimersByTime(250); });
  expect(current()?.textContent).toBe('1:41Third line');
  act(() => player.events.onStateChange({ data: 2 }));
  player.time = 84;
  act(() => { vi.advanceTimersByTime(1000); });
  expect(current()?.textContent).toBe('1:41Third line');
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('choosing a language translates the captions once and reuses stored translations', async () => {
  mocks.queries.set('youtubeMoments:latest', done({ translations: [{ moment: 1, language: 'ta', texts: ['தாமதமான வரி'] }] }));
  render(<YouTubeMomentResults />);
  const translate = mocks.calls.get('youtubeMoments:translate')!;
  translate.mockResolvedValueOnce(['पहली पंक्ति', 'दूसरी पंक्ति', 'तीसरी पंक्ति']);
  const first = within(card('He actually said it'));
  fireEvent.change(first.getByLabelText('Caption language'), { target: { value: 'hi' } });
  expect(first.getByText('Translating…')).toBeTruthy();
  expect(translate).toHaveBeenCalledWith({ id: 'analysis1', moment: 0, language: 'hi' });
  expect(await first.findByText('पहली पंक्ति')).toBeTruthy();
  expect(first.getByRole('list', { name: 'Captions' }).getAttribute('lang')).toBe('hi');
  const late = within(card('The late reveal'));
  fireEvent.change(late.getByLabelText('Caption language'), { target: { value: 'ta' } });
  expect(late.getByText('தாமதமான வரி')).toBeTruthy();
  expect(translate).toHaveBeenCalledTimes(1);
  translate.mockRejectedValueOnce(new Error('translation down'));
  const cold = within(card('Cold open'));
  fireEvent.change(cold.getByLabelText('Caption language'), { target: { value: 'ja' } });
  expect(await cold.findByText('Could not translate the captions. Try again.')).toBeTruthy();
  expect((cold.getByLabelText('Caption language') as HTMLSelectElement).value).toBe('');
  expect(cold.getByText('Open line')).toBeTruthy();
});

test('copy share link writes the public clip URL, then falls back to a visible link', async () => {
  mocks.queries.set('youtubeMoments:latest', done());
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  render(<YouTubeMomentResults />);
  mocks.calls.get('youtubeMoments:share')!.mockResolvedValue({ token });
  const first = within(card('He actually said it'));
  fireEvent.click(first.getByRole('button', { name: 'Copy share link' }));
  expect(await first.findByText('Link copied')).toBeTruthy();
  expect(mocks.calls.get('youtubeMoments:share')).toHaveBeenCalledWith({ id: 'analysis1', moment: 0 });
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/clip/${token}`);
  fireEvent.click(first.getByRole('button', { name: 'Copy share link' }));
  expect((await first.findByLabelText('Copy this link') as HTMLInputElement).value).toBe(`${window.location.origin}/clip/${token}`);
});

test('render as MP4 hands the moment to Edit upload with a trim, or a cut note past 5 minutes', () => {
  mocks.queries.set('youtubeMoments:latest', done());
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  openYouTubeTab();
  const prompt = () => (screen.getByRole('textbox', { name: 'Video prompt' }) as HTMLTextAreaElement).value;
  fireEvent.click(within(card('He actually said it')).getByRole('button', { name: 'Render as MP4 from your own copy' }));
  expect(screen.getByRole('button', { name: 'Edit upload' }).getAttribute('aria-pressed')).toBe('true');
  expect(prompt()).toBe('Trim 1:23 to 1:58 and add captions');
  expect(screen.getByText('Upload your own copy of this video. The trim is filled in for you.')).toBeTruthy();
  expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  fireEvent.click(screen.getByRole('button', { name: 'Clip', exact: true }));
  fireEvent.click(within(card('The late reveal')).getByRole('button', { name: 'Render as MP4 from your own copy' }));
  expect(prompt()).toBe('Add captions');
  expect(screen.getByText('Uploads can be up to 5 minutes. Upload your own copy cut to 4:50 to 5:35.')).toBeTruthy();
  expect(momentHandOff({ start_sec: 270, end_sec: 300 }).prompt).toBe('Trim 4:30 to 5:00 and add captions');
  expect(momentHandOff({ start_sec: 270, end_sec: 300.2 }).prompt).toBe('Add captions');
  expect(momentHandOff({ start_sec: 3725, end_sec: 3760 }).note).toBe('Uploads can be up to 5 minutes. Upload your own copy cut to 1:02:05 to 1:02:40.');
});

test('a player error explains itself below the player and links to the video on YouTube', async () => {
  mocks.queries.set('youtubeMoments:latest', done());
  render(<YouTubeMomentResults />);
  await act(async () => {});
  const first = card('He actually said it');
  act(() => playerFor(first).events.onError({ data: 150 }));
  const link = within(first).getByRole('link', { name: 'Watch it on YouTube' });
  expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83s');
  expect([link.getAttribute('target'), link.getAttribute('rel')]).toEqual(['_blank', 'noopener']);
  expect(within(first).getByText(/The owner turned off playback on other sites\./)).toBeTruthy();
  const iframe = first.querySelector('iframe')!;
  expect(iframe.parentElement!.contains(link)).toBe(false);
  expect(iframe.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const late = card('The late reveal');
  act(() => playerFor(late).events.onError({ data: 100 }));
  expect(within(late).getByText('This video is private, removed or not found.')).toBeTruthy();
  expect(within(late).queryByRole('link', { name: 'Watch it on YouTube' })).toBeNull();
});

test('a shared moment link shows the read-only card', async () => {
  mocks.queries.set('youtubeMoments:shared', { videoId: 'dQw4w9WgXcQ', moment: moments[0] });
  openClip(token);
  const shared = await screen.findByRole('article', { name: 'He actually said it' });
  expect(mocks.queryArgs.get('youtubeMoments:shared')).toEqual({ token });
  expect(new URL(shared.querySelector('iframe')!.src).pathname).toBe('/embed/dQw4w9WgXcQ');
  expect(within(shared).queryByRole('combobox')).toBeNull();
  expect(within(shared).queryByRole('button')).toBeNull();
  expect(screen.getByRole('link', { name: 'Shared from TakeOne' }).getAttribute('href')).toBe('/');
});

test('a removed moment is unavailable and a malformed link never queries', async () => {
  mocks.queries.set('youtubeMoments:shared', null);
  const view = openClip(token);
  expect(await screen.findByRole('heading', { name: 'Moment unavailable' })).toBeTruthy();
  expect(screen.getByText('This link is invalid or the moment was removed.')).toBeTruthy();
  view.unmount();
  mocks.queryArgs.clear();
  openClip('not-a-share-token');
  expect(await screen.findByRole('heading', { name: 'Moment unavailable' })).toBeTruthy();
  expect(mocks.queryArgs.has('youtubeMoments:shared')).toBe(false);
});

test('shared moment pages are not indexed', () => {
  expect(metadataFor(`/clip/${token}`)).toMatchObject({ robots: 'noindex, nofollow', title: 'A shared moment | TakeOne' });
});
