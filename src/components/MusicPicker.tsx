import { useAction, useQuery } from 'convex/react';
import { useRef, useState } from 'react';
import { AudioUpload, RemoveAudio } from './AudioUpload';
import { api } from '../lib/convexApi';
export type MusicSelection = { trackId: string; volume: number; duck: boolean; replaceSourceAudio?: boolean };
function TrackPreview({ trackId }: { trackId: string }) {
  const preview = useAction(api.music.preview);
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  return <div>
    <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" onClick={async () => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError('');
      try { const result = await preview({ trackId }) as { url: string }; setUrl(result.url); }
      catch { setError('Preview unavailable. Try again when the music service is connected.'); }
      finally { pending.current = false; setBusy(false); }
    }}>{busy ? 'Loading preview…' : url ? 'Refresh preview' : 'Preview soundtrack · free'}</button>
    {url && <audio aria-label="Soundtrack preview" src={url} controls className="mt-2 w-full" onError={() => { setUrl(''); setError('Preview expired or unavailable. Load it again.'); }} />}
    {url && <p className="mt-1 text-xs text-muted">Original track preview. Your music level and speech ducking are applied when rendering.</p>}
    {error && <p role="status" className="mt-1 text-xs text-red-600">{error}</p>}
  </div>;
}
export function MusicPicker({ value, onChange, disabled }: { value?: MusicSelection; onChange: (value?: MusicSelection) => void; disabled?: boolean }) {
  const tracks = useQuery(api.music.listTracks) as { id: string; label: string; attribution: string }[] | undefined;
  const chosen = tracks?.find(t => t.id === value?.trackId);
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-ink/10 bg-white p-4 text-sm">
    <legend className="px-1 font-semibold">Background music</legend>
    <label className="block">Soundtrack
      <select aria-label="Soundtrack" value={value?.trackId ?? ''} onChange={e => onChange(e.target.value ? { trackId: e.target.value, volume: value?.volume ?? 0.18, duck: value?.duck ?? true, replaceSourceAudio: value?.replaceSourceAudio ?? false } : undefined)} className="mt-1 block w-full rounded-lg border p-2">
        <option value="">Keep existing audio</option>
        {tracks?.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </label>
    {tracks?.length === 0 && <p className="text-muted">Choose your own audio below, or use the music library when it is connected.</p>}
    <AudioUpload onReady={trackId => onChange({ trackId, volume: value?.volume ?? 0.18, duck: value?.duck ?? true, replaceSourceAudio: value?.replaceSourceAudio ?? false })} />
    {value && <>
      {value.trackId.startsWith('upload:') && <RemoveAudio key={value.trackId} trackId={value.trackId} onRemoved={() => onChange(undefined)} />}
      <TrackPreview key={value.trackId} trackId={value.trackId} />
      <label className="block">Music level: {Math.round(value.volume * 100)}%
        <input aria-label="Music level" className="block w-full" type="range" min="0" max="100" value={Math.round(value.volume * 100)} onChange={e => onChange({ ...value, volume: Number(e.target.value) / 100 })} />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={value.replaceSourceAudio} checked={value.duck && !value.replaceSourceAudio} onChange={e => onChange({ ...value, duck: e.target.checked })} />Lower music while someone speaks</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={value.replaceSourceAudio ?? false} onChange={e => onChange({ ...value, replaceSourceAudio: e.target.checked })} />Remove all original audio, including speech</label>
      {chosen && <p className="text-xs text-muted">{chosen.attribution}</p>}
      <p className="text-xs text-muted">{value.replaceSourceAudio ? 'Only the selected soundtrack will remain. Speech, original music and sound effects will be removed from the new version.' : 'Adds a soundtrack to this version. Existing music remains in the source audio.'}</p>
    </>}
  </fieldset>;
}
