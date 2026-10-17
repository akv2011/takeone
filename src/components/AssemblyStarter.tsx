import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { FilmStrip, X } from '@phosphor-icons/react';
import { api } from '../lib/convexApi';
import { sourceKey, type SourceOption, type TimelineSource } from '../lib/assemblyTimeline';
import { Tooltip } from './Tooltip';
import { button, field, label } from '../lib/ui';

export function AssemblyStarter({ accountKey, compact = false }: { accountKey: string; compact?: boolean }) {
  const navigate = useNavigate();
  const sources = useQuery(api.projects.listSources, accountKey ? { accountKey } : 'skip') as SourceOption[] | undefined;
  const createAssembly = useMutation(api.projects.createAssembly);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TimelineSource[]>([]);
  const [name, setName] = useState('My assembly');
  const [aspect, setAspect] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [fit, setFit] = useState<'crop' | 'fit'>('crop');
  const [preserveAudio, setPreserveAudio] = useState(true);
  const [seconds, setSeconds] = useState('30');
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const scopeEpoch = useRef(0);
  const pending = useRef<{ fingerprint: string; requestId: string } | undefined>(undefined);
  useEffect(() => {
    scopeEpoch.current += 1;
    inFlight.current = false;
    pending.current = undefined;
    setBusy(false); setError(''); setSelected([]); setRights(false);
    return () => { scopeEpoch.current += 1; };
  }, [accountKey]);
  const byKey = new Map((sources ?? []).map(source => [sourceKey(source.source), source]));
  const totalAvailableMs = selected.reduce((sum, source) => sum + (byKey.get(sourceKey(source))?.durationMs ?? 0), 0);
  const targetMs = Math.round(Number(seconds) * 1000);
  const valid = selected.length >= 2 && selected.length <= 8 && rights && name.trim().length > 0 && Number.isInteger(targetMs) && targetMs >= selected.length * 100 && targetMs <= Math.min(300_000, totalAvailableMs);

  const toggle = (source: TimelineSource) => setSelected(current => {
    const key = sourceKey(source); const found = current.some(item => sourceKey(item) === key);
    return found ? current.filter(item => sourceKey(item) !== key) : current.length < 8 ? [...current, source] : current;
  });
  const submit = async () => {
    if (!valid || inFlight.current) return;
    const payload = { name: name.trim(), aspect, fit, preserveAudio, targetDurationMs: targetMs, sources: selected };
    const fingerprint = JSON.stringify(payload);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
    const requestEpoch = scopeEpoch.current;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await createAssembly({ ...payload, confirmedOwnership: true, requestId: pending.current.requestId }) as { projectId: string };
      if (scopeEpoch.current !== requestEpoch) return;
      pending.current = undefined;
      navigate(`/studio/project/${result.projectId}`);
    } catch { if (scopeEpoch.current === requestEpoch) setError('Could not create this assembly. Check the selected lengths and try again.'); }
    finally { if (scopeEpoch.current === requestEpoch) { inFlight.current = false; setBusy(false); } }
  };

  if (!open) return <Tooltip label="Combine 2 to 8 finished videos into one editable timeline" side="bottom"><button type="button" aria-label="Assemble clips" onClick={() => setOpen(true)} className={button('secondary', compact ? 'md' : 'lg')}><FilmStrip aria-hidden="true" size={18} />Assemble</button></Tooltip>;
  return <section aria-label="Create an assembly" className="basis-full rounded-card bg-surface/95 p-5 shadow-card sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-[19px] font-semibold tracking-[-0.02em]">Assemble clips</h2>
        <p className="mt-1 text-[13px] text-muted">2 to 8 sources, split into up to 12 clips in Studio. Creating and saving drafts is free; exporting uses one generation.</p>
      </div>
      <button type="button" aria-label="Close assembly builder" onClick={() => setOpen(false)} className={`${button('ghost', 'md')} w-10 shrink-0 px-0!`}><X aria-hidden="true" size={18} /></button>
    </div>
    {sources === undefined ? <div role="status" className="mt-5 grid gap-2 sm:grid-cols-2"><span className="sr-only">Loading your safe source library…</span>{[0, 1].map(i => <div key={i} aria-hidden="true" className="h-16 rounded-control bg-ink/5 motion-safe:animate-pulse" />)}</div>
      : sources.length < 2 ? <p className="mt-5 text-sm text-ink2">Create or upload at least two ready videos first.</p>
        : <div className="mt-5 grid gap-2 sm:grid-cols-2">{sources.map(source => {
          const key = sourceKey(source.source); const position = selected.findIndex(item => sourceKey(item) === key) + 1;
          return <label key={key} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-control bg-surface px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(20,19,17,.12)] transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(20,19,17,.3)] has-[:checked]:shadow-[inset_0_0_0_1.5px_#141311]"><input type="checkbox" className="size-[18px] shrink-0 accent-ink" checked={position > 0} onChange={() => toggle(source.source)} aria-label={`Select ${source.label}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold">{source.label}</strong><span className="font-mono text-[12px] text-muted">{(source.durationMs / 1000).toFixed(1)}s · {source.width}×{source.height}</span></span>{position > 0 && <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-semibold tabular-nums text-surface">{position}</span>}</label>;
        })}</div>}
    {selected.length > 0 && <ol aria-label="Selected playback order" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink2">{selected.map(source => <li key={sourceKey(source)}>{selected.indexOf(source) + 1}. {byKey.get(sourceKey(source))?.label}</li>)}</ol>}
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className={label}>Project name<input aria-label="Project name" value={name} maxLength={80} onChange={e => setName(e.target.value)} className={`${field} mt-1.5 w-full`} /></label>
      <label className={label}>Target length in seconds<input aria-label="Target length in seconds" type="number" min="0.2" max="300" step="0.1" value={seconds} onChange={e => setSeconds(e.target.value)} className={`${field} mt-1.5 w-full tabular-nums`} /></label>
      <label className={label}>Aspect<select aria-label="Assembly aspect" value={aspect} onChange={e => setAspect(e.target.value as typeof aspect)} className={`${field} mt-1.5 w-full`}><option>9:16</option><option>1:1</option><option>16:9</option></select></label>
      <label className={label}>Framing<select aria-label="Assembly framing" value={fit} onChange={e => setFit(e.target.value as typeof fit)} className={`${field} mt-1.5 w-full`}><option value="crop">Fill and crop</option><option value="fit">Fit whole frame</option></select></label>
      <label className="flex min-h-10 items-center gap-2.5 text-sm text-ink"><input type="checkbox" className="size-[18px] shrink-0 accent-ink" checked={preserveAudio} onChange={e => setPreserveAudio(e.target.checked)} />Preserve source audio</label>
      <label className="flex min-h-10 items-center gap-2.5 text-sm text-ink"><input type="checkbox" className="size-[18px] shrink-0 accent-ink" checked={rights} onChange={e => setRights(e.target.checked)} />I own or have permission to use all selected footage.</label>
    </div>
    {!Number.isNaN(targetMs) && targetMs > totalAvailableMs && selected.length > 0 && <p role="alert" className="mt-3 text-sm text-grease">Target length exceeds the selected footage.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-grease">{error}</p>}
    <button type="button" disabled={!valid || busy} onClick={() => void submit()} className={`${button('primary', 'md')} mt-5`}>{busy ? 'Creating…' : 'Create assembly · free'}</button>
  </section>;
}
