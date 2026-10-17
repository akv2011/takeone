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

  if (!open) return <Tooltip label="Combine 2 to 8 finished videos into one editable timeline" side="bottom"><button type="button" aria-label="Assemble clips" onClick={() => setOpen(true)} className={`inline-flex items-center gap-2 border border-ink bg-surface text-sm text-ink transition-colors hover:bg-paper2 ${compact ? 'h-10 px-3' : 'px-4 py-2.5'}`}><FilmStrip aria-hidden="true" size={16} weight="regular" />Assemble</button></Tooltip>;
  return <section aria-label="Create an assembly" className="sheet basis-full p-4 shadow-hard-sm sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="display text-3xl">Assemble clips</h2>
        <p className="mt-2 flex flex-wrap gap-1.5">{['2 to 8 sources', 'Up to 12 clips in Studio', 'Export uses 1 generation'].map(chip => <span key={chip} className="border border-ink/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink2">{chip}</span>)}</p>
        <p className="mt-2 text-xs text-muted">Creating and saving drafts is free.</p>
      </div>
      <button type="button" aria-label="Close assembly builder" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center text-ink2 hover:bg-paper2 hover:text-ink"><X aria-hidden="true" size={18} /></button>
    </div>
    {sources === undefined ? <div role="status" className="mt-5 grid gap-2 sm:grid-cols-2"><span className="sr-only">Loading your safe source library…</span>{[0, 1].map(i => <div key={i} aria-hidden="true" className="pat-dots h-14 border border-line opacity-20 motion-safe:animate-pulse" />)}</div>
      : sources.length < 2 ? <p className="mt-5 border-l-2 border-ink pl-3 text-sm">Create or upload at least two ready videos first.</p>
        : <div className="mt-5 grid gap-2 sm:grid-cols-2">{sources.map(source => {
          const key = sourceKey(source.source); const position = selected.findIndex(item => sourceKey(item) === key) + 1;
          return <label key={key} className="relative flex cursor-pointer gap-3 border border-ink/30 bg-surface p-3 transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-paper2 has-[:checked]:shadow-hard-sm"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={position > 0} onChange={() => toggle(source.source)} aria-label={`Select ${source.label}`} /><span className="min-w-0"><strong className="block truncate text-sm font-medium">{source.label}</strong><span className="font-mono text-[11px] text-muted">{(source.durationMs / 1000).toFixed(1)}s · {source.width}×{source.height}</span></span>{position > 0 && <span className="ml-auto font-display text-2xl leading-none" aria-hidden="true">{position}</span>}</label>;
        })}</div>}
    {selected.length > 0 && <ol aria-label="Selected playback order" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-y border-ink py-2 text-sm">{selected.map(source => <li key={sourceKey(source)}>{selected.indexOf(source) + 1}. {byKey.get(sourceKey(source))?.label}</li>)}</ol>}
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className={label}>Project name<input aria-label="Project name" value={name} maxLength={80} onChange={e => setName(e.target.value)} className={`${field} mt-1.5 w-full normal-case tracking-normal`} /></label>
      <label className={label}>Target length in seconds<input aria-label="Target length in seconds" type="number" min="0.2" max="300" step="0.1" value={seconds} onChange={e => setSeconds(e.target.value)} className={`${field} mt-1.5 w-full font-mono`} /></label>
      <label className={label}>Aspect<select aria-label="Assembly aspect" value={aspect} onChange={e => setAspect(e.target.value as typeof aspect)} className={`${field} mt-1.5 w-full font-mono`}><option>9:16</option><option>1:1</option><option>16:9</option></select></label>
      <label className={label}>Framing<select aria-label="Assembly framing" value={fit} onChange={e => setFit(e.target.value as typeof fit)} className={`${field} mt-1.5 w-full normal-case tracking-normal`}><option value="crop">Fill and crop</option><option value="fit">Fit whole frame</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={preserveAudio} onChange={e => setPreserveAudio(e.target.checked)} />Preserve source audio</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={rights} onChange={e => setRights(e.target.checked)} />I own or have permission to use all selected footage.</label>
    </div>
    {!Number.isNaN(targetMs) && targetMs > totalAvailableMs && selected.length > 0 && <p role="alert" className="mt-3 border-l-2 border-signal pl-2 text-sm text-signal">Target length exceeds the selected footage.</p>}
    {error && <p role="alert" className="mt-3 border-l-2 border-signal pl-2 text-sm text-signal">{error}</p>}
    <button type="button" disabled={!valid || busy} onClick={() => void submit()} className={`${button('primary')} mt-5`}>{busy ? 'Creating…' : 'Create assembly · free'}</button>
  </section>;
}
