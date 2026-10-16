// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
const mocks = vi.hoisted(() => ({
 authenticated: true,
 userId: 'owner',
 jobStatus: 'done',
 query: vi.fn(),
 read: vi.fn(),
 mutation: vi.fn(),
 download: vi.fn(),
 sceneError: false,
}));
vi.mock('../src/lib/auth', () => ({ SignedIn: ({ children }: {children: unknown}) => children, SignedOut: () => null, SignInChoices: () => null, useAuth: () => ({ user: mocks.userId ? { id: mocks.userId, isGuest: false, name: 'Test User' } : null, loading: false }) }));
vi.mock('convex/react', () => ({
 useConvexAuth: () => ({ isAuthenticated: mocks.authenticated, isLoading: false }),
 useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
  const name = getFunctionName(ref);
  mocks.query(name, args);
  if (args === 'skip') return undefined;
  switch (name) {
   case 'generate:getJob': return mocks.userId === 'owner' && mocks.jobStatus !== 'missing' ? { _id: 'source', mode: 'generate', status: mocks.jobStatus, prompt: 'Soap', hasOutput: true, hasSource: false, hasCaptionArchive: true } : null;
   case 'generate:versions': return [{ _id: 'source', prompt: 'Soap', status: 'done', createdAt: 1, original: true }];
   case 'projects:forSource': return null;
   case 'scenePlans:get': if (mocks.sceneError) throw Error('Scene backend unavailable'); return { state: 'unavailable', scenes: [] };
   case 'brandKits:list': return [{ _id: 'soap-kit', name: 'Soap brand', revision: 3, settings: { font: 'sans', captionStyle: 'clean', textColor: '#FFFFFF', outlineColor: '#000000' } }];
   case 'music:listTracks': return [];
   default: return undefined;
  }
 },
 usePaginatedQuery: () => ({ results: [], status: 'Exhausted', loadMore: vi.fn() }),
 useMutation: () => mocks.mutation,
 useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === 'generate:getCaptionCues' ? mocks.read : mocks.download,
}));
import Studio from '../src/pages/Studio';
const page = () => <MemoryRouter initialEntries={['/studio/source']}><Routes><Route path="/studio/:id" element={<Studio />} /></Routes></MemoryRouter>;
beforeEach(() => {
 mocks.authenticated = true; mocks.sceneError = false; mocks.userId = 'owner'; mocks.jobStatus = 'done'; mocks.query.mockReset(); mocks.read.mockReset().mockResolvedValue([{ start: 0.25, end: 1, text: 'Soap foam' }, { start: 2, end: 3.875, text: 'Wash hands' }]);
 mocks.mutation.mockReset(); mocks.download.mockReset().mockResolvedValue({ url: 'https://storage.googleapis.com/source.mp4' });
 vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
 vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
 vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
test('Studio transcript uses the owner read action and local player only', async () => {
 render(page());
 const video = await screen.findByLabelText('Current video') as HTMLVideoElement;
 Object.defineProperty(video, 'duration', { configurable: true, value: 4 }); fireEvent.loadedMetadata(video);
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 await screen.findByLabelText('Search transcript');
 expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ jobId: 'source' });
 fireEvent.change(screen.getByLabelText('Search transcript'), { target: { value: 'hands' } });
 fireEvent.click(screen.getByRole('button', { name: /Wash hands/ }));
 expect(video.currentTime).toBe(2);
 fireEvent.click(screen.getByRole('button', { name: 'Preview cue 2' }));
 expect(video.play).toHaveBeenCalled();
 expect(mocks.mutation).not.toHaveBeenCalled();
});
test('Studio account switch discards a pending transcript response', async () => {
 let resolve!: (value: { start: number; end: number; text: string }[]) => void;
 mocks.read.mockImplementation(() => new Promise(done => { resolve = done; }));
 const view = render(page()); await screen.findByLabelText('Current video');
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 mocks.userId = 'other'; view.rerender(page());
 await act(async () => resolve([{ start: 0, end: 1, text: 'Private previous words' }]));
 expect(screen.queryByText('Private previous words')).toBeNull();
 expect(screen.queryByLabelText('Search transcript')).toBeNull();
 expect(mocks.mutation).not.toHaveBeenCalled();
});

test('a failed scene query leaves the video and transcript usable', async () => {
 const log = vi.spyOn(console, 'error').mockImplementation(() => {});
 mocks.sceneError = true;
 render(page());
 expect(await screen.findByLabelText('Current video')).toBeTruthy();
 expect(screen.getByRole('button', { name: 'Retry scene details' })).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Load transcript · free' }));
 expect(await screen.findByLabelText('Search transcript')).toBeTruthy();
 expect(mocks.mutation).not.toHaveBeenCalled();
 log.mockRestore();
});

test('Studio brand selection is free and its explicit render sends the selected immutable revision', async () => {
 mocks.mutation.mockResolvedValue({ jobId: 'brand-output' }); render(page()); await screen.findByLabelText('Current video');
 fireEvent.change(screen.getByLabelText('Saved brand kit'), { target: { value: 'soap-kit' } });
 expect(mocks.mutation).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Apply brand kit · 1 generation' }));
 await act(async () => {});
 expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({ sourceJobId: 'source', brandKit: { kitId: 'soap-kit', revision: 3 }, requestId: expect.any(String) });
});

test('Studio puts the completed source project first while retaining scenes and version history', async () => {
 render(page());
 const video = await screen.findByLabelText('Current video') as HTMLVideoElement;
 Object.defineProperty(video, 'duration', { configurable: true, value: 4.25 });
 fireEvent.loadedMetadata(video);

 const aside = screen.getByLabelText('Project versions');
 const project = screen.getByLabelText('Editable project');
 const scenes = screen.getByLabelText('Scene plan');
 const history = screen.getByLabelText('Version history');
 const children = Array.from(aside.children);
 expect(children.indexOf(project)).toBeLessThan(children.indexOf(scenes));
 expect(children.indexOf(project)).toBeLessThan(children.indexOf(history));
 expect((screen.getByRole('button', { name: 'Create editable project' }) as HTMLButtonElement).disabled).toBe(false);
 expect(mocks.query).toHaveBeenCalledWith('projects:forSource', {
  sourceJobId: 'source',
  accountKey: 'owner',
 });
});

test.each([
 ['queued source', true, 'owner', 'queued'],
 ['failed source', true, 'owner', 'failed'],
 ['unavailable source', true, 'owner', 'missing'],
 ['unauthenticated source', false, 'owner', 'done'],
 ['unowned source', true, 'other', 'done'],
] as const)('Studio does not mount a project timeline for a %s', async (_label, authenticated, userId, jobStatus) => {
 mocks.authenticated = authenticated;
 mocks.userId = userId;
 mocks.jobStatus = jobStatus;
 render(page());
 await act(async () => {});

 expect(screen.queryByLabelText('Editable project')).toBeNull();
 expect(mocks.query.mock.calls.some(([name]) => name === 'projects:forSource')).toBe(false);
 expect(screen.getByLabelText('Scene plan')).toBeTruthy();
});
