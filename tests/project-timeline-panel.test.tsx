// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFunctionName } from 'convex/server';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  queryResult: null as unknown,
  queryError: false,
  query: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
}));

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    mocks.query(getFunctionName(ref), args);
    if (mocks.queryError) throw new Error('private query detail');
    return mocks.queryResult;
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === 'projects:createFromJob' ? mocks.create : mocks.edit,
}));

import { ProjectTimelinePanel } from '../src/components/ProjectTimelinePanel';

const project = {
  projectId: 'project-1',
  name: 'Launch cut',
  activeRevisionId: 'revision-2',
  revision: 2,
  timeline: {
    version: 1,
    aspect: '16:9',
    durationMs: 8_125,
    video: [{ id: 'clip-1' }, { id: 'clip-2' }],
    transitions: [],
    text: [],
    graphics: [],
  },
  updatedAt: 1,
};

const props = {
  sourceJobId: 'source-job',
  accountKey: 'owner',
  duration: 4.5676,
  disabled: false,
};

beforeEach(() => {
  mocks.authenticated = true;
  mocks.queryResult = null;
  mocks.queryError = false;
  mocks.query.mockReset();
  mocks.create.mockReset();
  mocks.edit.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'project-request-1234') });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('skips the project query without authentication, account, or source', () => {
  mocks.authenticated = false;
  const view = render(<ProjectTimelinePanel {...props} />);
  expect(mocks.query).toHaveBeenLastCalledWith('projects:forSource', 'skip');

  mocks.authenticated = true;
  view.rerender(<ProjectTimelinePanel {...props} accountKey="" />);
  expect(mocks.query).toHaveBeenLastCalledWith('projects:forSource', 'skip');

  view.rerender(<ProjectTimelinePanel {...props} sourceJobId="" />);
  expect(mocks.query).toHaveBeenLastCalledWith('projects:forSource', 'skip');
});

test('offers explicit free project creation after a valid duration loads', () => {
  render(<ProjectTimelinePanel {...props} />);
  expect((screen.getByRole('button', { name: 'Create editable project' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(/no generation is used/i)).toBeTruthy();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.edit).not.toHaveBeenCalled();
});

test('creates once with the exact rounded payload and displays the returned revision', async () => {
  let resolve!: (value: typeof project) => void;
  mocks.create.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<ProjectTimelinePanel {...props} />);

  const create = screen.getByRole('button', { name: 'Create editable project' });
  fireEvent.click(create);
  fireEvent.click(create);
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
    sourceJobId: 'source-job',
    durationMs: 4_568,
    requestId: 'project-request-1234',
  });
  expect(mocks.edit).not.toHaveBeenCalled();

  await act(async () => resolve(project));
  expect(screen.getByText('Launch cut')).toBeTruthy();
  expect(screen.getByText('Revision 2')).toBeTruthy();
  expect(screen.getByText('Saved draft · no generation used')).toBeTruthy();
});

test('uses a valid request ID fallback when randomUUID is unavailable', async () => {
  vi.stubGlobal('crypto', {});
  mocks.create.mockResolvedValue(project);
  render(<ProjectTimelinePanel {...props} />);

  fireEvent.click(screen.getByRole('button', { name: 'Create editable project' }));
  await screen.findByText('Launch cut');

  const requestId = mocks.create.mock.calls[0][0].requestId;
  expect(requestId).toMatch(/^[\w-]{8,100}$/);
});

test.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, 0.099, 300.001])(
  'disables project creation for unloaded or invalid duration %s',
  duration => {
    render(<ProjectTimelinePanel {...props} duration={duration} />);
    expect((screen.getByRole('button', { name: 'Create editable project' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/load a video between 0.1 and 300 seconds/i)).toBeTruthy();
  },
);

test.each([
  ['source', { ...props, sourceJobId: 'new-source' }],
  ['account', { ...props, accountKey: 'new-owner' }],
] as const)('discards a late creation response after only the %s changes', async (_scope, nextProps) => {
  let resolve!: (value: typeof project) => void;
  mocks.create.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<ProjectTimelinePanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create editable project' }));

  view.rerender(<ProjectTimelinePanel {...nextProps} />);
  await act(async () => resolve(project));

  expect(screen.queryByText('Launch cut')).toBeNull();
  expect((screen.getByRole('button', { name: 'Create editable project' }) as HTMLButtonElement).disabled).toBe(false);
});

test('discards a late creation response after unmount without a state update warning', async () => {
  let resolve!: (value: typeof project) => void;
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.create.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<><p>Studio remains available</p><ProjectTimelinePanel {...props} /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Create editable project' }));

  view.rerender(<p>Studio remains available</p>);
  await act(async () => resolve(project));

  expect(screen.getByText('Studio remains available')).toBeTruthy();
  expect(screen.queryByText('Launch cut')).toBeNull();
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test('summarizes an existing project without spending a generation', () => {
  mocks.queryResult = project;
  render(<ProjectTimelinePanel {...props} />);

  expect(mocks.query).toHaveBeenCalledWith('projects:forSource', {
    sourceJobId: 'source-job',
    accountKey: 'owner',
  });
  expect(screen.getByText('Launch cut')).toBeTruthy();
  expect(screen.getByText('Revision 2')).toBeTruthy();
  expect(screen.getByText('8.125s total · 2 clips')).toBeTruthy();
  expect(screen.getByText('Saved draft · no generation used')).toBeTruthy();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.edit).not.toHaveBeenCalled();
});

test('contains a malformed loaded query response without enabling creation', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.queryResult = { projectId: 'partial-private-value' };
  render(<ProjectTimelinePanel {...props} />);

  expect(screen.getByRole('alert').textContent).toContain('Project details could not load');
  expect(screen.queryByRole('button', { name: 'Create editable project' })).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();

  mocks.queryResult = null;
  fireEvent.click(screen.getByRole('button', { name: 'Retry project timeline' }));
  expect(screen.getByRole('button', { name: 'Create editable project' })).toBeTruthy();
  expect(mocks.create).not.toHaveBeenCalled();
  log.mockRestore();
});

test('handles a malformed creation response as a safe retryable failure', async () => {
  mocks.create.mockResolvedValue({ projectId: 'partial-private-value' });
  render(<ProjectTimelinePanel {...props} />);

  fireEvent.click(screen.getByRole('button', { name: 'Create editable project' }));

  expect((await screen.findByRole('alert')).textContent).toContain('Could not create the project');
  expect(screen.queryByText('partial-private-value')).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry project creation' })).toBeTruthy();
  expect(mocks.create).toHaveBeenCalledOnce();
});

test('shows a safe local creation failure and retries without disrupting siblings', async () => {
  mocks.create
    .mockRejectedValueOnce(new Error('private backend detail'))
    .mockResolvedValueOnce(project);
  render(<><video aria-label="Current video" /><ProjectTimelinePanel {...props} /></>);

  fireEvent.click(screen.getByRole('button', { name: 'Create editable project' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Could not create the project');
  expect(screen.getByRole('alert').textContent).not.toContain('private backend detail');
  expect(screen.getByLabelText('Current video')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Retry project creation' }));
  expect(mocks.create).toHaveBeenNthCalledWith(2, {
    sourceJobId: 'source-job',
    durationMs: 4_568,
    requestId: 'project-request-1234',
  });
  expect(await screen.findByText('Launch cut')).toBeTruthy();
  expect(screen.getByLabelText('Current video')).toBeTruthy();
});

test('contains a failed project query and retries without disrupting siblings', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.queryError = true;
  render(<><video aria-label="Current video" /><ProjectTimelinePanel {...props} /></>);

  expect(screen.getByRole('alert').textContent).toContain('Project details could not load');
  expect(screen.getByRole('alert').textContent).not.toContain('private query detail');
  expect(screen.getByLabelText('Current video')).toBeTruthy();

  mocks.queryError = false;
  mocks.queryResult = project;
  fireEvent.click(screen.getByRole('button', { name: 'Retry project timeline' }));
  expect(screen.getByText('Launch cut')).toBeTruthy();
  expect(screen.getByLabelText('Current video')).toBeTruthy();
  log.mockRestore();
});
