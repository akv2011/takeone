import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { Film, X } from 'lucide-react';
import { api } from '../lib/convexApi';
import { sourceKey, type SourceOption, type TimelineSource } from '../lib/assemblyTimeline';
import { Tooltip } from './Tooltip';
import { button, field, label, panel } from '../lib/ui';

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

  if (!open) return <Tooltip label="Combine 2 to 8 finished videos into one editable timeline" side="bottom"><button type="button" aria-label="Assemble clips" onClick={() => setOpen(true)} className={`inline-flex items-center gap-2 rounded-md border border-line bg-surface text-sm font-semibold text-ink transition-colors hover:border-ink ${compact ? 'h-10 px-3' : 'px-4 py-2.5'}`}><Film className="h-4 w-4" aria-hidden="true" />Assemble</button></Tooltip>;
  return <section aria-label="Create an assembly" className={`${panel} basis-full p-5`}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Assemble clips</h2><p className="mt-1 text-sm text-muted">Choose 2 to 8 source videos in playback order, then split or duplicate up to 12 clips in Studio. Creating and saving drafts is free; exporting uses one generation.</p></div><button type="button" aria-label="Close assembly builder" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:bg-paper hover:text-ink"><X aria-hidden="true" className="h-5 w-5" /></button></div>
    {sources === undefined ? <p role="status" className="mt-5 text-sm">Loading your safe source library…</p> : sources.length < 2 ? <p className="mt-5 text-sm">Create or upload at least two ready videos first.</p> : <div className="mt-5 grid gap-2 sm:grid-cols-2">{sources.map(source => {
      const key = sourceKey(source.source); const position = selected.findIndex(item => sourceKey(item) === key) + 1;
      return <label key={key} className="flex cursor-pointer gap-3 rounded-md border border-line p-3 hover:border-muted has-[:checked]:border-ink has-[:checked]:bg-cue/25"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={position > 0} onChange={() => toggle(source.source)} aria-label={`Select ${source.label}`} /><span><strong className="block text-sm">{source.label}</strong><span className="text-xs text-muted"><span className="font-mono">{(source.durationMs / 1000).toFixed(1)}s</span> · {source.width}×{source.height}{position ? ` · selected ${position}` : ''}</span></span></label>;
    })}</div>}
    {selected.length > 0 && <ol aria-label="Selected playback order" className="mt-4 space-y-1 rounded-md border border-line bg-paper p-3 text-sm">{selected.map(source => <li key={sourceKey(source)}>{selected.indexOf(source) + 1}. {byKey.get(sourceKey(source))?.label}</li>)}</ol>}
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className={label}>Project name<input aria-label="Project name" value={name} maxLength={80} onChange={e => setName(e.target.value)} className={`${field} mt-1 w-full`} /></label>
      <label className={label}>Target length in seconds<input aria-label="Target length in seconds" type="number" min="0.2" max="300" step="0.1" value={seconds} onChange={e => setSeconds(e.target.value)} className={`${field} mt-1 w-full`} /></label>
      <label className={label}>Aspect<select aria-label="Assembly aspect" value={aspect} onChange={e => setAspect(e.target.value as typeof aspect)} className={`${field} mt-1 w-full`}><option>9:16</option><option>1:1</option><option>16:9</option></select></label>
      <label className={label}>Framing<select aria-label="Assembly framing" value={fit} onChange={e => setFit(e.target.value as typeof fit)} className={`${field} mt-1 w-full`}><option value="crop">Fill and crop</option><option value="fit">Fit whole frame</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={preserveAudio} onChange={e => setPreserveAudio(e.target.checked)} />Preserve source audio</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={rights} onChange={e => setRights(e.target.checked)} />I own or have permission to use all selected footage.</label>
    </div>
    {!Number.isNaN(targetMs) && targetMs > totalAvailableMs && selected.length > 0 && <p role="alert" className="mt-3 text-sm text-warn">Target length exceeds the selected footage.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-warn">{error}</p>}
    <button type="button" disabled={!valid || busy} onClick={() => void submit()} className={`${button('primary')} mt-5`}>{busy ? 'Creating…' : 'Create assembly · free'}</button>
  </section>;
}
