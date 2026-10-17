import { MusicNotes } from "@phosphor-icons/react";
import { InspectorSection, GenerationTicket, PanelState } from "./StudioWorkspace";
import { useAction, useQuery } from 'convex/react';
import { useRef, useState } from 'react';
import { AudioUpload, RemoveAudio } from './AudioUpload';
import { api } from '../lib/convexApi';
import { button, field, fieldsetPanel, label, legend } from '../lib/ui';
export type MusicSelection = { trackId: string; volume: number; duck: boolean; replaceSourceAudio?: boolean };
function TrackPreview({ trackId }: { trackId: string }) {
  const preview = useAction(api.music.preview);
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  return <div>
    <button type="button" disabled={busy} className={button('secondary', 'sm')} onClick={async () => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError('');
      try { const result = await preview({ trackId }) as { url: string }; setUrl(result.url); }
      catch { setError('Preview unavailable. Try again when the music service is connected.'); }
      finally { pending.current = false; setBusy(false); }
    }}>{busy ? 'Loading preview…' : url ? 'Refresh preview' : 'Preview soundtrack · free'}</button>
    {url && <audio aria-label="Soundtrack preview" src={url} controls className="mt-2 w-full" onError={() => { setUrl(''); setError('Preview expired or unavailable. Load it again.'); }} />}
    {url && <p className="mt-1 text-xs text-ink2">Original track preview. Your music level and speech ducking are applied when rendering.</p>}
    {error && <p role="status" className="mt-1 text-xs text-warn">{error}</p>}
  </div>;
}
export function MusicPicker({ value, onChange, disabled, onApply }: { value?: MusicSelection; onChange: (value?: MusicSelection) => void; disabled?: boolean; onApply?(): void }) {
  const tracks = useQuery(api.music.listTracks) as { id: string; label: string; attribution: string }[] | undefined;
  const chosen = tracks?.find(t => t.id === value?.trackId);
  return <InspectorSection title="Background music" icon={MusicNotes} help="Choose a soundtrack or upload audio you own. Preview is free. Apply the soundtrack to save a new video version."><fieldset disabled={disabled} className={`${fieldsetPanel} space-y-3 text-sm disabled:opacity-60`}>
    <legend className={legend}>Background music</legend>
    {tracks === undefined && <PanelState loading>Loading music library…</PanelState>}
    <label className={`block ${label}`}>Soundtrack
      <select aria-label="Soundtrack" value={value?.trackId ?? ''} onChange={e => onChange(e.target.value ? { trackId: e.target.value, volume: value?.volume ?? 0.18, duck: value?.duck ?? true, replaceSourceAudio: value?.replaceSourceAudio ?? false } : undefined)} className={`${field} mt-1 block w-full`}>
        <option value="">Keep existing audio</option>
        {tracks?.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </label>
    {tracks?.length === 0 && <p className="text-ink2">Choose your own audio below, or use the music library when it is connected.</p>}
    <AudioUpload onReady={trackId => onChange({ trackId, volume: value?.volume ?? 0.18, duck: value?.duck ?? true, replaceSourceAudio: value?.replaceSourceAudio ?? false })} />
    {value && <>
      {value.trackId.startsWith('upload:') && <RemoveAudio key={value.trackId} trackId={value.trackId} onRemoved={() => onChange(undefined)} />}
      <TrackPreview key={value.trackId} trackId={value.trackId} />
      <label className={`block ${label}`}>Music level: {Math.round(value.volume * 100)}%
        <input aria-label="Music level" className="mt-1 block w-full accent-ink" type="range" min="0" max="100" value={Math.round(value.volume * 100)} onChange={e => onChange({ ...value, volume: Number(e.target.value) / 100 })} />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" className="size-4 shrink-0 accent-ink" disabled={value.replaceSourceAudio} checked={value.duck && !value.replaceSourceAudio} onChange={e => onChange({ ...value, duck: e.target.checked })} />Lower music while someone speaks</label>
      <label className="flex items-center gap-2"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={value.replaceSourceAudio ?? false} onChange={e => onChange({ ...value, replaceSourceAudio: e.target.checked })} />Remove all original audio, including speech</label>
      {chosen && <p className="text-xs text-ink2">{chosen.attribution}</p>}
      <p className="text-xs text-ink2">{value.replaceSourceAudio ? 'Only the selected soundtrack will remain. Speech, original music and sound effects will be removed from the new version.' : 'Adds a soundtrack to this version. Existing music remains in the source audio.'}</p>
    </>}
    {value && onApply && <button type="button" onClick={onApply} className={button("primary", "sm")}>Apply soundtrack <GenerationTicket /></button>}
  </fieldset></InspectorSection>;
}
