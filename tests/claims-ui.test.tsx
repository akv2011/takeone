// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ClaimsCheck } from '../convex/claims';
const actions = vi.hoisted(() => ({ download: vi.fn(), cover: vi.fn() }));
vi.mock('convex/react', () => ({
  useAction: (fn: any) => getFunctionName(fn) === 'generate:getCover' ? actions.cover : actions.download,
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
  usePaginatedQuery: () => ({ results: [], status: 'Exhausted', loadMore: vi.fn() }),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock('../src/lib/auth', () => ({ SignedIn: () => null, SignedOut: () => null, SignInChoices: () => null, GuestNotice: () => null, useAuth: () => ({ user: null, loading: false }) }));
import { ClaimsPanel } from '../src/components/ClaimsPanel';
import { ReelTile } from '../src/pages/Dashboard';

const redirect = (id: string) => `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${id}`;
const checked: ClaimsCheck = { status: 'checked', claims: [
  { text: 'The Eiffel Tower is 330 metres tall.', verdict: 'supported', reason: 'The operator lists 330 m.', sources: [{ url: redirect('a'), title: 'toureiffel.paris' }], searches: ['eiffel tower height & width'] },
  { text: 'Water boils at 50 C at sea level.', verdict: 'disputed', reason: 'Sources put it at 100 C.', sources: [], searches: [] },
  { text: 'The tower grows 15 cm in summer.', verdict: 'unverified', reason: 'No source gives a figure.', sources: [], searches: [] },
] };
beforeEach(() => {
  actions.download.mockReset().mockResolvedValue({ url: 'https://storage.googleapis.com/video.mp4' });
  actions.cover.mockReset().mockResolvedValue({ url: 'https://storage.googleapis.com/cover.png' });
});
afterEach(cleanup);

test('each claim shows its verdict as text and colour, its reason and its sources in a new tab, with no search chip or query links', () => {
  const view = render(<ClaimsPanel claims={checked} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check claims' }));
  fireEvent.click(screen.getByRole('button', { name: 'How this works' }));
  expect(screen.getByRole('heading', { name: 'Claims' })).toBeTruthy();
  expect(screen.getByText(/Gemini with Google Search checked factual claims.*Verdicts can be wrong/)).toBeTruthy();
  const items = screen.getAllByRole('listitem').filter(item => item.parentElement?.tagName === 'OL');
  expect(items).toHaveLength(3);
  for (const [item, label, colour] of [[items[0], 'Supported', 'text-go'], [items[1], 'Disputed', 'text-grease'], [items[2], 'Unclear', 'text-wait']] as const) {
    expect(within(item).getByText(label).className).toContain(colour);
  }
  expect(within(items[0]).getByText('The operator lists 330 m.')).toBeTruthy();
  const sourceLink = within(items[0]).getByRole('link', { name: 'toureiffel.paris (opens in a new tab)' });
  expect(sourceLink.getAttribute('href')).toBe(redirect('a'));
  expect(sourceLink.getAttribute('target')).toBe('_blank');
  expect(sourceLink.getAttribute('rel')).toBe('noopener noreferrer');
  expect(view.container.querySelector('iframe')).toBeNull();
  expect(document.querySelector('[href^="https://www.google.com/search"]')).toBeNull();
  expect(within(items[1]).queryByRole('link')).toBeNull();
  expect(view.container.textContent).not.toMatch(/[–—]/);
});


test.each([
  [{ status: 'unavailable' } as const, 'The claims check could not finish for this video. Check its claims before sharing.'],
  [{ status: 'checked', claims: [] } as const, 'Gemini found no factual claims to check in this video.'],
])('shows a plain message for %j', (claims, message) => {
  render(<ClaimsPanel claims={claims} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check claims' }));
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});

const tile = (job: Partial<Parameters<typeof ReelTile>[0]['job']> = {}) => render(<MemoryRouter><ReelTile job={{ _id: 'job-1', mode: 'generate', prompt: 'Tower facts', status: 'done', hasOutput: true, ...job }} /></MemoryRouter>);

test('a finished video with a cover shows it as the tile poster', async () => {
  const view = tile({ hasCover: true });
  await waitFor(() => expect(view.container.querySelector('video')?.getAttribute('poster')).toBe('https://storage.googleapis.com/cover.png'));
  expect(actions.cover).toHaveBeenCalledExactlyOnceWith({ jobId: 'job-1' });
});

test.each([
  ['no cover', {}, 0],
  ['a cover on an unfinished video', { hasCover: true, status: 'processing', hasOutput: false }, 0],
  ['a failed signature', { hasCover: true }, 1, () => actions.cover.mockRejectedValue(Error('COVER_UNAVAILABLE'))],
  ['a non-https URL', { hasCover: true }, 1, () => actions.cover.mockResolvedValue({ url: 'http://storage.googleapis.com/cover.png' })],
])('%s keeps the tile without a poster', async (_name, job, coverCalls, arrange?: () => void) => {
  arrange?.();
  const view = tile(job);
  await act(async () => {});
  expect(actions.cover).toHaveBeenCalledTimes(coverCalls);
  expect(view.container.querySelector('[poster]')).toBeNull();
});
