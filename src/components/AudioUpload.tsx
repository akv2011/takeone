import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { CaretDown, MusicNotes } from '@phosphor-icons/react';
import { api } from '../lib/convexApi';
import { uploadVideo } from '../lib/uploadVideo';

export function AudioUpload({ onReady }: { onReady(id: string): void }) {
  const begin = useMutation(api.uploads.begin), finish = useMutation(api.uploads.finish);
  const [rights, setRights] = useState(false), [status, setStatus] = useState('');
  const [progress, setProgress] = useState<number>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function choose(file?: File) {
    if (!file || !rights || controller.current) return;
    if (!['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'].includes(file.type) || file.size < 1 || file.size > 20 * 1024 * 1024) {
      setStatus('Choose an MP3, WAV or M4A audio file up to 20 MB.'); return;
    }
    const active = new AbortController(); controller.current = active;
    setProgress(0); setStatus('Uploading your soundtrack…');
    try {
      const { uploadId, url } = await begin({ kind: 'audio', confirmedOwnership: true, name: file.name, contentType: file.type, size: file.size }) as { uploadId: string; url: string };
      active.signal.throwIfAborted();
      const storageId = await uploadVideo(url, file, setProgress, active.signal);
      active.signal.throwIfAborted();
      await finish({ uploadId, storageId });
      if (!active.signal.aborted) { setStatus('Soundtrack uploaded and selected. Preview it or create your video.'); onReady(`upload:${uploadId}`); }
    } catch (error) {
      if (active.signal.aborted) setStatus('Audio upload cancelled.');
      else if ((error as { data?: string })?.data === 'UPLOAD_LIMIT') setStatus('Upload limit reached: five uploads per hour and ten saved sources, shared with videos.');
      else setStatus('The audio did not upload. Check your connection and try again.');
    } finally {
      if (controller.current === active) { controller.current = null; setProgress(undefined); }
    }
  }
  return <details className="group border border-ink bg-surface">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
      <MusicNotes aria-hidden="true" size={16} />Upload your own soundtrack
      <CaretDown aria-hidden="true" size={14} className="ml-auto transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-ink/20 px-3 pb-3 pt-2.5">
      <p className="flex flex-wrap gap-1.5">{['MP3, WAV or M4A', 'Up to 20 MB', 'Free to upload and preview'].map(chip => <span key={chip} className="border border-ink/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink2">{chip}</span>)}</p>
      <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" className="size-4 shrink-0 accent-ink" checked={rights} disabled={progress !== undefined} onChange={e => setRights(e.target.checked)} />I have permission to use this audio in exported videos.</label>
      <input aria-label="Upload soundtrack" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a" disabled={!rights || progress !== undefined} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} className="mt-3 block w-full text-xs file:mr-3 file:border file:border-ink file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-paper2 disabled:cursor-not-allowed disabled:opacity-50" />
      {progress !== undefined && <div className="mt-3 flex items-center gap-3">
        <div role="progressbar" aria-label="Audio upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-2 flex-1 border border-ink bg-surface"><div className="h-full bg-ink transition-[width] duration-300 ease-paper" style={{ width: `${progress}%` }} /></div>
        <button type="button" className="font-mono text-[11px] uppercase tracking-[0.06em] underline underline-offset-4 hover:text-signal" onClick={() => controller.current?.abort()}>Cancel audio upload</button>
      </div>}
      {status && <p role="status" className="mt-3 border-l-2 border-ink pl-2 text-xs">{status}</p>}
    </div>
  </details>;
}
export function RemoveAudio({ trackId, onRemoved }: { trackId: string; onRemoved(): void }) {
  const remove = useMutation(api.uploads.remove);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), pending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return <div><button type="button" disabled={busy} className="text-xs underline" onClick={async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await remove({ uploadId: trackId.slice(7) }); if (alive.current) onRemoved(); }
    catch { if (alive.current) setError('Could not remove this audio. Wait for any active renders to finish.'); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }}>Remove uploaded soundtrack</button>{error && <p role="status" className="text-xs text-signal">{error}</p>}</div>;
}
