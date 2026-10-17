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
  return <details className="group rounded-card bg-surface/90 shadow-card">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-card px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
      <MusicNotes aria-hidden="true" size={18} />Upload your own soundtrack
      <CaretDown aria-hidden="true" size={16} className="ml-auto text-ink2 transition-transform duration-150 group-open:rotate-180" />
    </summary>
    <div className="px-4 pb-4">
      <p className="text-[13px] text-muted">MP3, WAV or M4A, up to 20 MB. Uploading and previewing are free.</p>
      <label className="mt-3 flex items-start gap-2.5 text-sm text-ink"><input type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-ink" checked={rights} disabled={progress !== undefined} onChange={e => setRights(e.target.checked)} />I have permission to use this audio in exported videos.</label>
      <input aria-label="Upload soundtrack" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a" disabled={!rights || progress !== undefined} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} className="mt-3 block w-full text-[13px] text-ink2 file:mr-3 file:h-9 file:rounded-control file:border-0 file:bg-ink file:px-3 file:text-[13px] file:font-semibold file:text-surface hover:file:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-45" />
      {progress !== undefined && <div className="mt-3 flex items-center gap-3">
        <div role="progressbar" aria-label="Audio upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-ink transition-[width] duration-300 ease-paper" style={{ width: `${progress}%` }} /></div>
        <button type="button" className="text-[13px] font-semibold text-ink underline-offset-4 hover:underline" onClick={() => controller.current?.abort()}>Cancel audio upload</button>
      </div>}
      {status && <p role="status" className="mt-3 text-[13px] text-ink2">{status}</p>}
    </div>
  </details>;
}
export function RemoveAudio({ trackId, onRemoved }: { trackId: string; onRemoved(): void }) {
  const remove = useMutation(api.uploads.remove);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), pending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return <div><button type="button" disabled={busy} className="text-[13px] font-semibold text-ink underline-offset-4 hover:underline disabled:opacity-45" onClick={async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await remove({ uploadId: trackId.slice(7) }); if (alive.current) onRemoved(); }
    catch { if (alive.current) setError('Could not remove this audio. Wait for any active renders to finish.'); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }}>Remove uploaded soundtrack</button>{error && <p role="status" className="text-[13px] text-grease">{error}</p>}</div>;
}
