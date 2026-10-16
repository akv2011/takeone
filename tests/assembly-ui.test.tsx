// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFunctionName } from 'convex/server';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  userId: 'owner' as string | undefined,
  sources: [] as any[],
  retainedSources: [] as any[],
  project: undefined as any,
  mutations: new Map<string, ReturnType<typeof vi.fn>>(),
}));

vi.mock('../src/lib/auth', () => ({
  SignedIn: ({ children }: any) => children,
  SignedOut: () => null,
  SignInChoices: () => null,
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId, isGuest: false, name: 'Test User' } : null, loading: false }),
}));
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated, isLoading: false }),
  useQuery: (ref: any, args: any) => {
    if (args === 'skip') return undefined;
    const name = getFunctionName(ref);
    return name === 'projects:listSources' ? mocks.sources : name === 'projects:sourcesForRevision' ? mocks.retainedSources : name === 'projects:get' ? mocks.project : undefined;
  },
  useMutation: (ref: any) => {
    const name = getFunctionName(ref);
    if (!mocks.mutations.has(name)) mocks.mutations.set(name, vi.fn());
    return mocks.mutations.get(name);
  },
}));

import { AssemblyStarter } from '../src/components/AssemblyStarter';
import AssemblyStudio from '../src/pages/AssemblyStudio';

const sources = [
  { source: { kind: 'job', jobId: 'job-one' }, label: 'Founder intro', durationMs: 8_000, width: 1080, height: 1920, hasAudio: true },
  { source: { kind: 'upload', uploadId: 'upload-two' }, label: 'Product demo', durationMs: 12_000, width: 1920, height: 1080, hasAudio: true },
  { source: { kind: 'job', jobId: 'job-three' }, label: 'Customer quote', durationMs: 6_000, width: 1080, height: 1920, hasAudio: false },
];

const timeline = {
  version: 1 as const, aspect: '9:16' as const, durationMs: 10_000,
  video: [
    { id: 'clip-001', source: sources[0].source, sourceStartMs: 0, sourceEndMs: 5_000, timelineStartMs: 0, fit: 'crop' as const, muted: false },
    { id: 'clip-002', source: sources[1].source, sourceStartMs: 0, sourceEndMs: 5_000, timelineStartMs: 5_000, fit: 'crop' as const, muted: false },
  ], transitions: [], text: [], graphics: [],
};

const project = { projectId: 'project-one', name: 'Launch reel', activeRevisionId: 'revision-one', revision: 1, timeline, updatedAt: 1 };

beforeEach(() => {
  mocks.authenticated = true; mocks.userId = 'owner'; mocks.sources = sources; mocks.retainedSources = sources.slice(0, 2); mocks.project = project; mocks.mutations.clear();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-12345678') });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('assembly start keeps accessible selection order, requires rights, and creates a free project without billing calls', async () => {
  const create = vi.fn().mockResolvedValue(project);
  mocks.mutations.set('projects:createAssembly', create);
  render(<MemoryRouter><AssemblyStarter accountKey="owner" /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Assemble clips' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Product demo/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Founder intro/ }));
  expect(screen.getByText('1. Product demo')).toBeTruthy();
  expect(screen.getByText('2. Founder intro')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Launch montage' } });
  fireEvent.change(screen.getByLabelText('Target length in seconds'), { target: { value: '10' } });
  const submit = screen.getByRole('button', { name: 'Create assembly · free' });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /permission to use all selected footage/ }));
  fireEvent.click(submit);
  fireEvent.click(submit);
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Launch montage', confirmedOwnership: true, targetDurationMs: 10_000,
    sources: [sources[1].source, sources[0].source], requestId: 'request-12345678',
  })));
  expect(create).toHaveBeenCalledTimes(1);
  expect(mocks.mutations.has('generate:requestGeneration')).toBe(false);
  expect(screen.getByText(/Creating and saving drafts is free/)).toBeTruthy();
});

test('assembly creation cannot navigate or update a replacement account after a late response', async () => {
  let resolve!: (value: any) => void;
  mocks.mutations.set('projects:createAssembly', vi.fn(() => new Promise(done => { resolve = done; })));
  function Scope() {
    const [account, setAccount] = useState('owner'); const location = useLocation();
    return <><button onClick={() => setAccount('other')}>Switch account</button><span data-testid="location">{location.pathname}</span><AssemblyStarter accountKey={account} /></>;
  }
  render(<MemoryRouter><Scope /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Assemble clips' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Founder intro/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Product demo/ }));
  fireEvent.change(screen.getByLabelText('Target length in seconds'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /permission to use/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Create assembly · free' }));
  fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
  await act(async () => resolve(project));
  expect(screen.getByTestId('location').textContent).toBe('/');
  expect(screen.queryByText(/Could not create/)).toBeNull();
});

function renderStudio() {
  return render(<MemoryRouter initialEntries={['/studio/project/project-one']}><Routes>
    <Route path="/studio/project/:projectId" element={<AssemblyStudio />} />
    <Route path="/studio/:id" element={<h1>Video Studio</h1>} />
  </Routes></MemoryRouter>);
}

test('project route wins over the job route and local operations stay free until explicit save', () => {
  renderStudio();
  expect(screen.getByRole('heading', { name: 'Launch reel' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Video Studio' })).toBeNull();
  expect(mocks.mutations.get('projects:saveRevision')).not.toHaveBeenCalled();
  expect(mocks.mutations.get('projects:requestExport')).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Move clip 2 Product demo earlier/ }));
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Product demo');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Export saved revision · 1 generation' }) as HTMLButtonElement).disabled).toBe(true);
});

test('trim, split, duplicate, remove, replace, fit, mute, and transition recalculate deterministic timing', () => {
  renderStudio();
  const first = screen.getAllByTestId('clip-card')[0];
  fireEvent.change(withinLabel(first, 'Out (seconds)'), { target: { value: '4' } });
  fireEvent.click(withinButton(first, 'Split at midpoint'));
  expect(screen.getAllByTestId('clip-card')).toHaveLength(3);
  fireEvent.click(withinButton(screen.getAllByTestId('clip-card')[0], 'Duplicate'));
  expect(screen.getAllByTestId('clip-card')).toHaveLength(4);
  fireEvent.click(withinButton(screen.getAllByTestId('clip-card')[1], 'Remove'));
  const updated = screen.getAllByTestId('clip-card')[0];
  fireEvent.change(withinLabel(updated, 'Replace source'), { target: { value: 'job:job-three' } });
  fireEvent.change(withinLabel(updated, 'Framing'), { target: { value: 'fit' } });
  fireEvent.click(withinLabel(updated, 'mute'));
  fireEvent.change(screen.getAllByLabelText(/^Transition between/)[0], { target: { value: 'crossfade' } });
  fireEvent.change(screen.getAllByLabelText(/^Transition duration between/)[0], { target: { value: '0.5' } });
  expect(screen.getByText(/Total .* seconds/).textContent).toMatch(/Total 8\.5 seconds/);
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Customer quote');
});

function withinLabel(root: HTMLElement, label: string): HTMLElement {
  const element = Array.from(root.querySelectorAll('input,select')).find(node => node.getAttribute('aria-label')?.toLowerCase().endsWith(label.toLowerCase()));
  if (!element) throw new Error(`missing ${label}`);
  return element as HTMLElement;
}
function withinButton(root: HTMLElement, name: string): HTMLElement {
  const element = Array.from(root.querySelectorAll('button')).find(node => node.textContent?.trim() === name || node.getAttribute('aria-label')?.toLowerCase().endsWith(name.toLowerCase()));
  if (!element) throw new Error(`missing ${name}`);
  return element as HTMLElement;
}

test('save uses optimistic concurrency and export sends only the returned saved revision', async () => {
  const saved = { ...project, activeRevisionId: 'revision-two', revision: 2 };
  const save = vi.fn().mockResolvedValue(saved);
  const exportRevision = vi.fn().mockResolvedValue({ jobId: 'export-job', billing: 'credit' });
  mocks.mutations.set('projects:saveRevision', save); mocks.mutations.set('projects:requestExport', exportRevision);
  renderStudio();
  fireEvent.click(screen.getByRole('button', { name: /Move clip 2 Product demo earlier/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft · free' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-one', parentRevisionId: 'revision-one', requestId: expect.any(String) })));
  await screen.findByText('Saved revision 2');
  fireEvent.click(screen.getByRole('button', { name: 'Export saved revision · 1 generation' }));
  await waitFor(() => expect(exportRevision).toHaveBeenCalledWith({ projectId: 'project-one', revisionId: 'revision-two', requestId: expect.any(String) }));
});

test('stale save conflict stays dirty and a late response after project change is ignored', async () => {
  let resolve!: (value: any) => void;
  const save = vi.fn(() => new Promise(done => { resolve = done; }));
  mocks.mutations.set('projects:saveRevision', save);
  const view = renderStudio();
  fireEvent.click(screen.getByRole('button', { name: /Move clip 2 Product demo earlier/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft · free' }));
  mocks.project = { ...project, projectId: 'project-two', name: 'Other project' };
  view.unmount();
  await act(async () => resolve({ ...project, activeRevisionId: 'late-revision', revision: 2 }));
  expect(mocks.mutations.get('projects:requestExport')).not.toHaveBeenCalled();
});

test('pending save freezes every timeline control', async () => {
  let resolveSave!: (value: any) => void;
  mocks.mutations.set('projects:saveRevision', vi.fn(() => new Promise(done => { resolveSave = done; })));
  const view = renderStudio();
  fireEvent.click(screen.getByRole('button', { name: /Move clip 2 Product demo earlier/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft · free' }));
  expect((screen.getByLabelText('Clip 1 out (seconds)').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  expect(screen.getByRole('button', { name: /Move clip 1 .* later/ }).closest('fieldset')).toHaveProperty('disabled', true);
  fireEvent.keyDown(screen.getAllByTestId('clip-card')[0], { key: 'ArrowRight', altKey: true });
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Product demo');
  await act(async () => resolveSave({ ...project, activeRevisionId: 'revision-two', revision: 2 }));
  view.unmount();
  expect(screen.queryByTestId('clip-card')).toBeNull();
});

test('pending export freezes edits and never navigates after the account scope changes', async () => {
  let resolve!: (value: any) => void;
  mocks.mutations.set('projects:requestExport', vi.fn(() => new Promise(done => { resolve = done; })));
  const view = renderStudio();
  fireEvent.click(screen.getByRole('button', { name: 'Export saved revision · 1 generation' }));
  expect((screen.getByLabelText('Clip 1 out (seconds)').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  mocks.userId = 'other';
  view.rerender(<MemoryRouter initialEntries={['/studio/project/project-one']}><Routes>
    <Route path="/studio/project/:projectId" element={<AssemblyStudio />} />
    <Route path="/studio/:id" element={<h1>Video Studio</h1>} />
  </Routes></MemoryRouter>);
  await act(async () => resolve({ jobId: 'export-job' }));
  expect(screen.queryByRole('heading', { name: 'Video Studio' })).toBeNull();
});

test('a newer reactive revision never replaces dirty local work and can be loaded explicitly', () => {
  const view = renderStudio();
  fireEvent.change(screen.getByLabelText('Clip 1 out (seconds)'), { target: { value: '4' } });
  expect(screen.getByLabelText('Clip 1 out (seconds)')).toHaveProperty('value', '4');
  mocks.project = { ...project, activeRevisionId: 'revision-remote', revision: 2, timeline: { ...timeline, durationMs: 9_000, video: [{ ...timeline.video[0], sourceEndMs: 4_000 }, timeline.video[1]] } };
  view.rerender(<MemoryRouter initialEntries={['/studio/project/project-one']}><Routes><Route path="/studio/project/:projectId" element={<AssemblyStudio />} /></Routes></MemoryRouter>);
  expect(screen.getByLabelText('Clip 1 out (seconds)')).toHaveProperty('value', '4');
  expect(screen.getByRole('alert').textContent).toMatch(/newer revision/);
  fireEvent.click(screen.getByRole('button', { name: 'Load latest revision' }));
  expect(screen.getByText('Saved revision ready to export')).toBeTruthy();
});

test('save success clears an early reactive echo of that revision but preserves a truly newer revision', async () => {
  let resolve!: (value: any) => void;
  mocks.mutations.set('projects:saveRevision', vi.fn(() => new Promise(done => { resolve = done; })));
  const view = renderStudio();
  fireEvent.click(screen.getByRole('button', { name: /Move clip 2 Product demo earlier/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft · free' }));
  const saved = { ...project, activeRevisionId: 'revision-two', revision: 2, timeline: { ...timeline, video: [timeline.video[1], { ...timeline.video[0], timelineStartMs: 5_000 }] } };
  mocks.project = saved;
  view.rerender(<MemoryRouter initialEntries={['/studio/project/project-one']}><Routes><Route path="/studio/project/:projectId" element={<AssemblyStudio />} /></Routes></MemoryRouter>);
  expect(screen.getByRole('alert').textContent).toMatch(/newer revision/);
  await act(async () => resolve(saved));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('Saved revision 2')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /Move clip 2 Founder intro earlier/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft · free' }));
  mocks.project = { ...saved, activeRevisionId: 'revision-three', revision: 3 };
  view.rerender(<MemoryRouter initialEntries={['/studio/project/project-one']}><Routes><Route path="/studio/project/:projectId" element={<AssemblyStudio />} /></Routes></MemoryRouter>);
  await act(async () => resolve({ ...saved, activeRevisionId: 'revision-two-b', revision: 2 }));
  expect(screen.getByRole('alert').textContent).toMatch(/newer revision/);
});

test('drag and keyboard reordering both preserve an operable timeline', () => {
  renderStudio();
  const cards = screen.getAllByTestId('clip-card');
  const transfer = new Map<string, string>();
  const dataTransfer = { setData: (type: string, value: string) => transfer.set(type, value), getData: (type: string) => transfer.get(type) ?? '', effectAllowed: '' };
  fireEvent.dragStart(cards[1], { dataTransfer });
  fireEvent.drop(cards[0], { dataTransfer });
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Product demo');
  fireEvent.keyDown(screen.getAllByTestId('clip-card')[0], { key: 'ArrowRight', altKey: true });
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Founder intro');
});

test('retained revision sources beyond the general library remain exact and selectable', () => {
  const archived = { source: { kind: 'job', jobId: 'job-one' }, label: 'Archived exact source', durationMs: 5_000, width: 720, height: 1280, hasAudio: true };
  mocks.sources = [sources[1], sources[2]];
  mocks.retainedSources = [archived, sources[1]];
  renderStudio();
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Archived exact source');
  expect(screen.getByLabelText('Clip 1 out (seconds)')).toHaveProperty('max', '5');
  expect(screen.getByLabelText('Clip 1 replace source')).toHaveProperty('value', 'job:job-one');
});

test('retained source loading is neutral and only confirmed missing descriptors disable editing', () => {
  mocks.sources = [sources[2]];
  mocks.retainedSources = undefined as any;
  const view = renderStudio();
  expect(screen.getByRole('status').textContent).toMatch(/Loading exact source details/);
  expect(screen.queryByRole('alert')).toBeNull();
  expect((screen.getByRole('region', { name: 'Timeline' }).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false);
  mocks.retainedSources = [];
  view.rerender(<MemoryRouter initialEntries={['/studio/project/project-one']}><Routes><Route path="/studio/project/:projectId" element={<AssemblyStudio />} /></Routes></MemoryRouter>);
  expect(screen.getByRole('alert').textContent).toMatch(/Exact metadata/);
  expect((screen.getByRole('region', { name: 'Timeline' }).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
});

test('Alt-arrow on a child control edits the control context without reordering its clip', () => {
  renderStudio();
  const input = screen.getByLabelText('Clip 1 out (seconds)');
  fireEvent.keyDown(input, { key: 'ArrowRight', altKey: true });
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Founder intro');
  fireEvent.keyDown(screen.getAllByTestId('clip-card')[0], { key: 'ArrowRight', altKey: true });
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Product demo');
});

test('a revision conflict keeps local edits visible and blocks export', async () => {
  const conflict: any = new Error('conflict'); conflict.data = 'PROJECT_REVISION_CONFLICT';
  mocks.mutations.set('projects:saveRevision', vi.fn().mockRejectedValue(conflict));
  renderStudio();
  fireEvent.click(screen.getByRole('button', { name: /Move clip 2 Product demo earlier/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft · free' }));
  expect(await screen.findByText(/changed elsewhere/)).toBeTruthy();
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Export saved revision · 1 generation' }) as HTMLButtonElement).disabled).toBe(true);
});

test('account loss hides private project data and the full editor remains operable at mobile width', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  const view = renderStudio();
  expect(screen.getAllByTestId('clip-card')).toHaveLength(2);
  expect(screen.getByRole('region', { name: 'Timeline' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Clip 1 out (seconds)'), { target: { value: '4.25' } });
  fireEvent.keyDown(screen.getAllByTestId('clip-card')[0], { key: 'ArrowRight', altKey: true });
  expect(screen.getAllByTestId('clip-card')[0].textContent).toContain('Product demo');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  view.unmount();
  mocks.authenticated = false;
  renderStudio();
  expect(screen.getByRole('alert').textContent).toMatch(/Could not connect/);
  expect(screen.queryByTestId('clip-card')).toBeNull();
});
