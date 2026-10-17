import { GenerationTicket, HelpNote, PanelState } from "./StudioWorkspace";
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/convexApi';
import { button, field, label } from '../lib/ui';

export function SceneReplacementControls({ jobId, accountKey, sceneCount, onReplaced }: { jobId: string; accountKey: string; sceneCount: number; onReplaced(jobId: string): void }) {
  const options = useQuery(api.sceneReplacements.options, { jobId, accountKey }) as { eligible: boolean; uploads: { id: string; name: string }[] } | undefined;
  const request = useMutation(api.sceneReplacements.request);
  const [index, setIndex] = useState(0), [uploadId, setUploadId] = useState('');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const contextKey = `${accountKey}:${jobId}`, scope = useRef(contextKey);
  scope.current = contextKey;
  const pending = useRef<{ payload: string; requestId: string } | null>(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (options === undefined) return <PanelState loading>Checking replacement sources…</PanelState>;
  if (!options.eligible) return <p className="mt-3 text-xs text-ink2">Scene replacement requires a retained clean video for this version.</p>;
  if (!options.uploads.length) return <p className="mt-3 text-xs text-ink2">Upload an owned video in the Dashboard to use as a replacement scene.</p>;
  const submit = async () => {
    if (busy || !confirmed || !options.uploads.some(u => u.id === uploadId)) return;
    const origin = contextKey;
    const payload = JSON.stringify([jobId, index, uploadId]);
    if (pending.current?.payload !== payload) pending.current = { payload, requestId: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      const result = await request({ sourceJobId: jobId, index, uploadId, requestId: pending.current.requestId, confirmedOwnership: true });
      if (alive.current && scope.current === origin) onReplaced(result.jobId);
    } catch { if (alive.current && scope.current === origin) setError('The replacement could not be queued. Check your allowance and source, then retry.'); }
    finally { if (alive.current && scope.current === origin) setBusy(false); }
  };
  return <fieldset disabled={busy} className="mt-4 space-y-3 border-t border-line pt-3">
    <legend className="text-sm font-semibold">Replace a scene</legend>
    <HelpNote>Keep the other scenes, original sound and saved captions. Visual effects in the selected scene are replaced. The replacement starts at its first frame and must cover the scene.</HelpNote>
    <label className={`block ${label}`}>Scene<select aria-label="Scene to replace" value={index} onChange={e => setIndex(Number(e.target.value))} className={`${field} mt-1 block w-full`}>{Array.from({ length: sceneCount }, (_, i) => <option key={i} value={i}>Scene {i+1}</option>)}</select></label>
    <label className={`block ${label}`}>Replacement video<select aria-label="Replacement video" value={uploadId} onChange={e => setUploadId(e.target.value)} className={`${field} mt-1 block w-full`}><option value="">Choose an uploaded video</option>{options.uploads.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    <label className="flex gap-2 text-xs"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I own this footage or have permission to use it.</label>
    <button type="button" disabled={busy || !uploadId || !confirmed} onClick={submit} className={button('primary', 'sm')}>{busy ? 'Queuing replacement…' : <>Replace scene <GenerationTicket /></>}</button>
    {error && <p role="alert" className="text-xs text-warn">{error}</p>}
  </fieldset>;
}
