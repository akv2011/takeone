import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
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
      else setStatus('Could not upload this audio. Please try again.');
    } finally {
      if (controller.current === active) { controller.current = null; setProgress(undefined); }
    }
  }
  return <details className="rounded-lg border border-black/10 p-3">
    <summary className="cursor-pointer font-medium">Upload your own soundtrack</summary>
    <p className="mt-2 text-xs text-muted">MP3, WAV or M4A · up to 20 MB. Uploading and previewing use no video allowance.</p>
    <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={rights} disabled={progress !== undefined} onChange={e => setRights(e.target.checked)} />I have permission to use this audio in exported videos.</label>
    <input aria-label="Upload soundtrack" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a" disabled={!rights || progress !== undefined} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} className="mt-2 block w-full text-xs" />
    {progress !== undefined && <div className="mt-2"><progress aria-label="Audio upload progress" value={progress} max={100} /><button type="button" className="ml-2 text-xs underline" onClick={() => controller.current?.abort()}>Cancel audio upload</button></div>}
    {status && <p role="status" className="mt-2 text-xs">{status}</p>}
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
  }}>Remove uploaded soundtrack</button>{error && <p role="status" className="text-xs text-red-600">{error}</p>}</div>;
}
