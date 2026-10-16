import { useEffect, useMemo, useRef, useState } from 'react';
import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, Copy, Scissors, Trash2 } from 'lucide-react';
import TakeOneLogo from '../components/TakeOneLogo';
import { api } from '../lib/convexApi';
import { recalculateTimeline, sourceKey, uniqueId, type SourceOption, type Timeline, type Transition } from '../lib/assemblyTimeline';

type ProjectView = { projectId: string; name: string; activeRevisionId: string; revision: number; timeline: Timeline; updatedAt: number };

export default function AssemblyStudio() {
  return <div className="min-h-screen bg-paper text-ink"><SignedOut><div className="flex min-h-screen flex-col items-center justify-center px-6 text-center"><TakeOneLogo className="h-10 w-10" /><h1 className="mt-4 font-display text-3xl font-bold">Sign in to edit this project</h1><SignInButton mode="modal"><button className="mt-6 rounded-xl bg-ink px-6 py-3 text-white">Continue with Google</button></SignInButton></div></SignedOut><SignedIn><AssemblyEditor /></SignedIn></div>;
}

function AssemblyEditor() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useUser();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const project = useQuery(api.projects.get, projectId && user?.id && isAuthenticated ? { projectId, accountKey: user.id } : 'skip') as ProjectView | null | undefined;
  const sources = useQuery(api.projects.listSources, user?.id && isAuthenticated ? { accountKey: user.id } : 'skip') as SourceOption[] | undefined;
  const saveRevision = useMutation(api.projects.saveRevision);
  const requestExport = useMutation(api.projects.requestExport);
  const [draft, setDraft] = useState<Timeline>();
  const [savedRevisionId, setSavedRevisionId] = useState('');
  const [savedRevision, setSavedRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'export' | ''>('');
  const [status, setStatus] = useState('');
  const [remoteProject, setRemoteProject] = useState<ProjectView>();
  const epoch = useRef(0);
  const initializedScope = useRef('');
  const draftGeneration = useRef(0);
  const operationInFlight = useRef(false);
  const savePending = useRef<{ fingerprint: string; requestId: string } | undefined>(undefined);
  const exportPending = useRef<{ revisionId: string; requestId: string } | undefined>(undefined);

  const scopeKey = `${user?.id ?? ''}:${projectId ?? ''}`;
  useEffect(() => {
    epoch.current += 1; initializedScope.current = '';
    operationInFlight.current = false; savePending.current = undefined; exportPending.current = undefined;
    setDraft(undefined); setSavedRevisionId(''); setSavedRevision(0); setDirty(false); setBusy(''); setStatus(''); setRemoteProject(undefined);
    return () => { epoch.current += 1; };
  }, [scopeKey]);
  useEffect(() => {
    if (!project) return;
    if (initializedScope.current !== scopeKey) {
      initializedScope.current = scopeKey; draftGeneration.current += 1;
      setDraft(structuredClone(project.timeline)); setSavedRevisionId(project.activeRevisionId);
      setSavedRevision(project.revision); setDirty(false); setRemoteProject(undefined);
      return;
    }
    if (savedRevisionId && project.revision > savedRevision && project.activeRevisionId !== savedRevisionId) setRemoteProject(project);
  }, [project, savedRevision, savedRevisionId, scopeKey]);

  const retainedSources = useQuery(api.projects.sourcesForRevision,
    projectId && savedRevisionId && user?.id && isAuthenticated
      ? { projectId, revisionId: savedRevisionId, accountKey: user.id }
      : 'skip') as SourceOption[] | undefined;
  const mergedSources = useMemo(() => {
    const merged = new Map<string, SourceOption>();
    for (const source of retainedSources ?? []) merged.set(sourceKey(source.source), source);
    for (const source of sources ?? []) if (!merged.has(sourceKey(source.source))) merged.set(sourceKey(source.source), source);
    return [...merged.values()];
  }, [retainedSources, sources]);
  const sourceMap = useMemo(() => new Map(mergedSources.map(source => [sourceKey(source.source), source])), [mergedSources]);
  const retainedSourcesLoading = !!savedRevisionId && retainedSources === undefined;
  const missingSourceMetadata = retainedSources !== undefined && !!draft && draft.video.some(clip => !sourceMap.has(sourceKey(clip.source)));
  const change = (next: Timeline) => {
    if (operationInFlight.current) return;
    const normalized = recalculateTimeline(next);
    if (normalized.durationMs > 300_000) { setStatus('Projects can be at most 300 seconds long.'); return; }
    draftGeneration.current += 1; setDraft(normalized); setDirty(true); setStatus('');
  };
  const updateClip = (index: number, patch: Partial<Timeline['video'][number]>) => {
    if (!draft) return; const video = draft.video.map((clip, i) => i === index ? { ...clip, ...patch } : clip);
    change({ ...draft, video });
  };
  const move = (index: number, direction: -1 | 1) => {
    if (!draft || index + direction < 0 || index + direction >= draft.video.length) return;
    const video = [...draft.video]; [video[index], video[index + direction]] = [video[index + direction], video[index]];
    change({ ...draft, video, transitions: [] });
  };
  const moveTo = (clipId: string, targetIndex: number) => {
    if (!draft) return; const from = draft.video.findIndex(clip => clip.id === clipId);
    if (from < 0 || from === targetIndex) return;
    const video = [...draft.video]; const [clip] = video.splice(from, 1); video.splice(targetIndex, 0, clip);
    change({ ...draft, video, transitions: [] });
  };
  const loadLatest = () => {
    if (!remoteProject || busy) return;
    epoch.current += 1; draftGeneration.current += 1; operationInFlight.current = false;
    setDraft(structuredClone(remoteProject.timeline)); setSavedRevisionId(remoteProject.activeRevisionId);
    setSavedRevision(remoteProject.revision); setDirty(false); setRemoteProject(undefined); setStatus('Loaded the latest saved revision.');
    savePending.current = undefined; exportPending.current = undefined;
  };
  const split = (index: number) => {
    if (!draft) return; const clip = draft.video[index], span = clip.sourceEndMs - clip.sourceStartMs;
    if (span < 200) return; const midpoint = clip.sourceStartMs + Math.floor(span / 2);
    const video = [...draft.video]; video.splice(index, 1, { ...clip, sourceEndMs: midpoint }, { ...clip, id: uniqueId(draft, 'clip'), sourceStartMs: midpoint });
    change({ ...draft, video, transitions: [] });
  };
  const duplicate = (index: number) => {
    if (!draft || draft.video.length >= 12) return; const copy = { ...draft.video[index], id: uniqueId(draft, 'clip') };
    change({ ...draft, video: [...draft.video.slice(0, index + 1), copy, ...draft.video.slice(index + 1)], transitions: [] });
  };
  const remove = (index: number) => { if (draft && draft.video.length > 2) change({ ...draft, video: draft.video.filter((_, i) => i !== index), transitions: [] }); };
  const setTransition = (index: number, type: Transition['type'], durationMs?: number) => {
    if (!draft) return; const left = draft.video[index], right = draft.video[index + 1], pair = (t: Transition) => t.fromClipId === left.id && t.toClipId === right.id;
    if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs < 100 || durationMs > 2_000)) return;
    const current = draft.transitions.find(pair); const transitions = draft.transitions.filter(t => !pair(t));
    if (type !== 'cut') transitions.push({ id: current?.id ?? uniqueId(draft, 'transition'), fromClipId: left.id, toClipId: right.id, type, durationMs: durationMs ?? current?.durationMs ?? 300 });
    change({ ...draft, transitions });
  };
  const save = async () => {
    if (!draft || !dirty || operationInFlight.current || !projectId || !savedRevisionId) return;
    const fingerprint = JSON.stringify(draft); if (savePending.current?.fingerprint !== fingerprint) savePending.current = { fingerprint, requestId: crypto.randomUUID() };
    const view = epoch.current; operationInFlight.current = true; setBusy('save'); setStatus('');
    try {
      const result = await saveRevision({ projectId, parentRevisionId: savedRevisionId, requestId: savePending.current.requestId, timeline: draft }) as ProjectView;
      if (epoch.current !== view) return;
      draftGeneration.current += 1; setDraft(structuredClone(result.timeline)); setSavedRevisionId(result.activeRevisionId); setSavedRevision(result.revision); setDirty(false);
      setRemoteProject(current => current?.activeRevisionId === result.activeRevisionId && current.revision === result.revision ? undefined : current);
      savePending.current = undefined; setStatus(`Saved revision ${result.revision}`);
    } catch (error: any) {
      if (epoch.current !== view) return;
      setStatus(error?.data === 'PROJECT_REVISION_CONFLICT' || error?.data?.code === 'PROJECT_REVISION_CONFLICT' ? 'This project changed elsewhere. Reload before saving your work.' : 'Could not save this draft. Your local changes are still here.');
    } finally { if (epoch.current === view) { operationInFlight.current = false; setBusy(''); } }
  };
  const exportSaved = async () => {
    if (dirty || operationInFlight.current || !projectId || !savedRevisionId) return;
    if (exportPending.current?.revisionId !== savedRevisionId) exportPending.current = { revisionId: savedRevisionId, requestId: crypto.randomUUID() };
    const view = epoch.current; const generation = draftGeneration.current; operationInFlight.current = true; setBusy('export'); setStatus('');
    try {
      const result = await requestExport({ projectId, revisionId: savedRevisionId, requestId: exportPending.current.requestId }) as { jobId: string };
      if (epoch.current !== view || draftGeneration.current !== generation) return; exportPending.current = undefined; navigate(`/studio/${result.jobId}`);
    } catch { if (epoch.current === view) setStatus('Could not queue this export. Your saved draft was not changed.'); }
    finally { if (epoch.current === view) { operationInFlight.current = false; setBusy(''); } }
  };

  if (!isAuthenticated && !isLoading) return <main className="mx-auto max-w-xl px-6 py-24"><p role="alert">Could not connect your sign-in. Return to the dashboard and sign in again.</p></main>;
  if (!projectId || project === null) return <main className="mx-auto max-w-xl px-6 py-24"><h1 className="font-display text-3xl font-bold">Project unavailable</h1><p className="mt-2 text-muted">The link may be invalid, or this project belongs to another account.</p><Link to="/create" className="mt-5 inline-block underline">Back to dashboard</Link></main>;
  if (!project || !draft) return <main role="status" className="mx-auto max-w-xl px-6 py-24">Loading project…</main>;

  return <>
    <header className="sticky top-0 z-20 border-b border-black/10 bg-paper/90 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6"><Link to="/create" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />Dashboard</Link><span className="font-mono text-[10px] uppercase tracking-widest">Project studio</span></div></header>
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-cueInk">Assembly</p><h1 className="mt-1 font-display text-3xl font-extrabold">{project.name}</h1><p className="mt-1 text-sm text-muted">Revision {savedRevision} · local edits and saves are free · export uses one generation</p></div><div className="flex flex-wrap gap-2"><button disabled={!dirty || !!busy || !!remoteProject || missingSourceMetadata} onClick={() => void save()} className="rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{busy === 'save' ? 'Saving…' : 'Save draft · free'}</button><button disabled={dirty || !!busy || !!remoteProject || missingSourceMetadata} onClick={() => void exportSaved()} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy === 'export' ? 'Queuing…' : 'Export saved revision · 1 generation'}</button></div></div>
      <div className="mt-4 min-h-6">{dirty ? <p className="text-sm font-semibold text-amber-700">Unsaved changes</p> : <p className="text-sm text-muted">Saved revision ready to export</p>}{status && <p role="status" className="mt-1 text-sm">{status}</p>}</div>
      {remoteProject && <div role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">A newer revision was saved elsewhere. Your local draft has not been replaced. <button disabled={!!busy} onClick={loadLatest} className="ml-1 font-semibold underline">Load latest revision</button></div>}
      {retainedSourcesLoading && <p role="status" className="mt-3 text-sm text-muted">Loading exact source details…</p>}
      {missingSourceMetadata && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700">Exact metadata for a retained source is unavailable. Editing and export are paused.</p>}
      <p id="timeline-reorder-help" className="sr-only">Drag clips to reorder, use the Earlier and Later buttons, or focus a clip and press Alt plus Left or Right Arrow.</p>
      <fieldset disabled={!!busy || missingSourceMetadata} className="min-w-0 disabled:opacity-70"><section aria-label="Timeline" className="mt-5 overflow-x-auto pb-4"><div className="flex min-w-max items-stretch gap-3">{draft.video.map((clip, index) => {
        const source = sourceMap.get(sourceKey(clip.source)); const span = clip.sourceEndMs - clip.sourceStartMs;
        const clipName = `Clip ${index + 1}`;
        return <div key={clip.id} className="flex items-center gap-3"><article data-testid="clip-card" tabIndex={0} draggable={!busy && !missingSourceMetadata} aria-describedby="timeline-reorder-help" aria-label={`${clipName}: ${source?.label ?? 'retained source'}`} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-takeone-id', clip.id); }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); moveTo(e.dataTransfer.getData('text/x-takeone-id'), index); }} onKeyDown={e => { if (e.target !== e.currentTarget || !e.altKey) return; if (e.key === 'ArrowLeft') { e.preventDefault(); move(index, -1); } else if (e.key === 'ArrowRight') { e.preventDefault(); move(index, 1); } }} className="w-[280px] rounded-2xl border border-black/10 bg-white p-4 shadow-sm focus-visible:ring-2 focus-visible:ring-ink">
          <div className="flex items-start justify-between gap-2"><div><span className="font-mono text-[9px] uppercase text-muted">Clip {index + 1}</span><h2 className="font-semibold">{source?.label ?? 'Retained project source'}</h2></div><span className="rounded-full bg-paper px-2 py-1 text-xs">{(span / 1000).toFixed(1)}s</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs">In (seconds)<input aria-label={`${clipName} in (seconds)`} type="number" min="0" max={(clip.sourceEndMs - 100) / 1000} step="0.001" value={clip.sourceStartMs / 1000} onChange={e => { const value = Math.round(Number(e.target.value) * 1000); if (Number.isInteger(value) && value >= 0 && value <= clip.sourceEndMs - 100) updateClip(index, { sourceStartMs: value }); }} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-xs">Out (seconds)<input aria-label={`${clipName} out (seconds)`} type="number" min={(clip.sourceStartMs + 100) / 1000} max={source ? source.durationMs / 1000 : undefined} step="0.001" value={clip.sourceEndMs / 1000} onChange={e => { if (!source) return; const value = Math.round(Number(e.target.value) * 1000); if (Number.isInteger(value) && value >= clip.sourceStartMs + 100 && value <= source.durationMs) updateClip(index, { sourceEndMs: value }); }} className="mt-1 w-full rounded-lg border p-2" /></label></div>
          <label className="mt-3 block text-xs">Replace source<select aria-label={`${clipName} replace source`} value={sourceKey(clip.source)} onChange={e => { const replacement = sourceMap.get(e.target.value); if (replacement) updateClip(index, { source: replacement.source, sourceStartMs: 0, sourceEndMs: Math.min(span, replacement.durationMs) }); }} className="mt-1 w-full rounded-lg border p-2">{mergedSources.map(item => <option key={sourceKey(item.source)} value={sourceKey(item.source)}>{item.label}</option>)}</select></label>
          <div className="mt-3 flex gap-2"><label className="flex-1 text-xs">Framing<select aria-label={`${clipName} framing`} value={clip.fit} onChange={e => updateClip(index, { fit: e.target.value as 'crop' | 'fit' })} className="mt-1 w-full rounded-lg border p-2"><option value="crop">Fill and crop</option><option value="fit">Fit whole frame</option></select></label><label className="flex items-end gap-2 pb-2 text-xs"><input aria-label={`${clipName} mute`} type="checkbox" checked={clip.muted} onChange={e => updateClip(index, { muted: e.target.checked })} />Mute</label></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button aria-label={`Move ${clipName.toLowerCase()} ${source?.label ?? 'retained source'} earlier`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg border p-2 text-xs disabled:opacity-30"><ArrowUp className="mr-1 inline h-3 w-3" />Earlier</button><button aria-label={`Move ${clipName.toLowerCase()} ${source?.label ?? 'retained source'} later`} disabled={index === draft.video.length - 1} onClick={() => move(index, 1)} className="rounded-lg border p-2 text-xs disabled:opacity-30"><ArrowDown className="mr-1 inline h-3 w-3" />Later</button><button aria-label={`${clipName} split at midpoint`} onClick={() => split(index)} disabled={span < 200} className="rounded-lg border p-2 text-xs"><Scissors className="mr-1 inline h-3 w-3" />Split at midpoint</button><button aria-label={`${clipName} duplicate`} onClick={() => duplicate(index)} disabled={draft.video.length >= 12} className="rounded-lg border p-2 text-xs"><Copy className="mr-1 inline h-3 w-3" />Duplicate</button><button aria-label={`${clipName} remove`} onClick={() => remove(index)} disabled={draft.video.length <= 2} className="col-span-2 rounded-lg border p-2 text-xs text-red-600 disabled:opacity-30"><Trash2 className="mr-1 inline h-3 w-3" />Remove</button></div>
        </article>{index < draft.video.length - 1 && <Boundary timeline={draft} index={index} onChange={setTransition} />}</div>;
      })}</div></section></fieldset>
      <p className="mt-2 font-mono text-xs">Total {(draft.durationMs / 1000).toFixed(1)} seconds · {draft.aspect}</p>
    </main>
  </>;
}

function Boundary({ timeline, index, onChange }: { timeline: Timeline; index: number; onChange: (index: number, type: Transition['type'], durationMs?: number) => void }) {
  const left = timeline.video[index], right = timeline.video[index + 1];
  const current = timeline.transitions.find(t => t.fromClipId === left.id && t.toClipId === right.id);
  const type = current?.type ?? 'cut';
  const boundary = `between Clip ${index + 1} and Clip ${index + 2}`;
  return <div className="w-36 rounded-xl border border-dashed border-black/20 bg-white/60 p-3"><label className="text-xs">Transition<select aria-label={`Transition ${boundary}`} value={type} onChange={e => onChange(index, e.target.value as Transition['type'])} className="mt-1 w-full rounded-lg border p-1.5"><option value="cut">Cut</option><option value="crossfade">Crossfade</option><option value="fade">Fade</option><option value="dip-black">Dip to black</option></select></label>{type !== 'cut' && <label className="mt-2 block text-xs">Duration (seconds)<input aria-label={`Transition duration ${boundary} (seconds)`} type="number" min="0.1" max="2" step="0.1" value={(current?.durationMs ?? 300) / 1000} onChange={e => onChange(index, type, Math.round(Number(e.target.value) * 1000))} className="mt-1 w-full rounded-lg border p-1.5" /></label>}</div>;
}
