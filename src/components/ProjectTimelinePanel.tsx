import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '../lib/convexApi';
import { button, panel } from '../lib/ui';

type ProjectView = {
  projectId: string;
  name: string;
  activeRevisionId: string;
  revision: number;
  timeline: { durationMs: number; video: unknown[] };
  updatedAt: number;
};

type Props = {
  sourceJobId?: string;
  accountKey?: string;
  duration?: number;
  disabled?: boolean;
};

type PendingCreate = {
  payload: string;
  requestId: string;
};

function advanceEpoch(epoch: { current: number }): number {
  return ++epoch.current;
}

function isCurrentEpoch(epoch: { current: number }, value: number): boolean {
  return epoch.current === value;
}

function requestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 14).padEnd(8, '0');
  return `project-${Date.now().toString(36)}-${random}`;
}

function isProjectView(value: unknown): value is ProjectView {
  if (!value || typeof value !== 'object') return false;
  const project = value as ProjectView;
  return typeof project.projectId === 'string' &&
    typeof project.activeRevisionId === 'string' &&
    typeof project.name === 'string' &&
    Number.isInteger(project.revision) && project.revision >= 1 &&
    !!project.timeline && Number.isInteger(project.timeline.durationMs) &&
    project.timeline.durationMs >= 100 && project.timeline.durationMs <= 300_000 &&
    Array.isArray(project.timeline.video);
}

function seconds(durationMs: number): string {
  return (durationMs / 1_000).toFixed(3).replace(/\.?0+$/, '');
}

export function ProjectTimelinePanel({ sourceJobId, accountKey, duration, disabled }: Props) {
  return (
    <ProjectReadBoundary key={`${accountKey ?? ''}:${sourceJobId ?? ''}`}>
      <ScopedProjectTimelinePanel
        sourceJobId={sourceJobId}
        accountKey={accountKey}
        duration={duration}
        disabled={disabled}
      />
    </ProjectReadBoundary>
  );
}

class ProjectReadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section aria-label="Editable project" className={`${panel} w-full p-4`}>
        <h2 className="text-base font-semibold">Project timeline</h2>
        <p role="alert" className="mt-2 text-xs text-warn">Project details could not load. The rest of Studio is still available.</p>
        <button type="button" onClick={() => this.setState({ failed: false })} className={`${button('secondary', 'sm')} mt-3`}>
          Retry project timeline
        </button>
      </section>
    );
  }
}

function ScopedProjectTimelinePanel({ sourceJobId, accountKey, duration, disabled }: Props) {
  const { isAuthenticated } = useConvexAuth();
  const result = useQuery(
    api.projects.forSource,
    isAuthenticated && sourceJobId && accountKey
      ? { sourceJobId, accountKey }
      : 'skip',
  ) as unknown;
  const createFromJob = useMutation(api.projects.createFromJob);
  const [created, setCreated] = useState<{ scope: string; project: ProjectView }>();
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<PendingCreate | null>(null);
  const inFlight = useRef(false);
  const epoch = useRef(0);

  useEffect(() => {
    const current = advanceEpoch(epoch);
    setCreated(undefined);
    setCreating(false);
    setFailed(false);
    pending.current = null;
    inFlight.current = false;
    return () => {
      if (isCurrentEpoch(epoch, current)) advanceEpoch(epoch);
    };
  }, [sourceJobId, accountKey]);

  const durationMs = typeof duration === 'number' && Number.isFinite(duration)
    ? Math.round(duration * 1_000)
    : undefined;
  const validDuration = durationMs !== undefined && durationMs >= 100 && durationMs <= 300_000;
  const scope = `${accountKey ?? ''}:${sourceJobId ?? ''}`;
  const queriedProject = isProjectView(result) ? result : undefined;
  if (result !== undefined && result !== null && !queriedProject) {
    throw new Error('INVALID_PROJECT_RESPONSE');
  }
  const project = created?.scope === scope
    ? created.project
    : queriedProject;

  const create = async () => {
    if (!sourceJobId || !validDuration || disabled || inFlight.current) return;
    const payload = JSON.stringify({ sourceJobId, durationMs });
    if (pending.current?.payload !== payload) {
      pending.current = { payload, requestId: requestId() };
    }
    const submittedEpoch = epoch.current;
    const submitted = pending.current;
    inFlight.current = true;
    setCreating(true);
    setFailed(false);
    try {
      const response = await createFromJob({
        sourceJobId,
        durationMs,
        requestId: submitted.requestId,
      });
      if (submittedEpoch !== epoch.current) return;
      if (!isProjectView(response)) throw new Error('INVALID_PROJECT_RESPONSE');
      setCreated({ scope, project: response });
      pending.current = null;
    } catch {
      if (submittedEpoch === epoch.current) setFailed(true);
    } finally {
      if (submittedEpoch === epoch.current) {
        inFlight.current = false;
        setCreating(false);
      }
    }
  };

  if (!isAuthenticated || !sourceJobId || !accountKey) return null;

  return (
    <section aria-label="Editable project" className={`${panel} w-full p-4`}>
      <h2 className="text-base font-semibold">Project timeline</h2>
      {project ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">{project.name}</h3>
            <span className="text-xs text-muted">Revision {project.revision}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {seconds(project.timeline.durationMs)}s total · {project.timeline.video.length}{' '}
            {project.timeline.video.length === 1 ? 'clip' : 'clips'}
          </p>
          <p className="mt-2 text-xs font-medium text-cueInk">Saved draft · no generation used</p>
        </div>
      ) : result === undefined ? (
        <p role="status" className="mt-2 text-xs text-muted">Loading editable project…</p>
      ) : (
        <div className="mt-3">
          <p className="text-xs text-muted">Create a saved timeline for this completed video. This is free; no generation is used.</p>
          <button
            type="button"
            disabled={disabled || creating || !validDuration}
            onClick={() => void create()}
            className={`${button('secondary', 'sm')} mt-3`}
          >
            {creating ? 'Creating editable project…' : failed ? 'Retry project creation' : 'Create editable project'}
          </button>
          {!validDuration && (
            <p className="mt-2 text-xs text-muted">Load a video between 0.1 and 300 seconds before creating a project.</p>
          )}
          {failed && (
            <p role="alert" className="mt-2 text-xs text-warn">Could not create the project. Try again; the rest of Studio is still available.</p>
          )}
        </div>
      )}
    </section>
  );
}
