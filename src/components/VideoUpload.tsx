import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/convexApi';
import { uploadVideo } from '../lib/uploadVideo';
import { Trash, WarningCircle } from '@phosphor-icons/react';
import { field, label } from '../lib/ui';
export function VideoUpload({ onReady }: { onReady: (id?: string) => void }) {
  const begin = useMutation(api.uploads.begin), finish = useMutation(api.uploads.finish);
  const uploads = useQuery(api.uploads.list) as { _id: string; name: string; size: number }[] | undefined;
  const probeStatuses = useQuery(api.uploads.probeStatuses) as { _id: string; name: string; size: number; status: string }[] | undefined;
  const remove = useMutation(api.uploads.remove);
  const [selected, setSelected] = useState('');
  const [preparing, setPreparing] = useState<{ id: string; name: string }>();
  const [progress, setProgress] = useState<number>();
  const [status, setStatus] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!preparing) return;
    if (uploads?.some(upload => upload._id === preparing.id)) {
      setSelected(preparing.id); onReady(preparing.id);
      setStatus(`${preparing.name} is ready. Describe your edit or let Gemini pick the best moment.`);
      setPreparing(undefined); return;
    }
    if (probeStatuses?.some(upload => upload._id === preparing.id && upload.status === 'failed')) {
      onReady(undefined); setStatus(`${preparing.name} could not be prepared. Remove it and try another video.`); setPreparing(undefined);
    }
  }, [uploads, probeStatuses, preparing, onReady]);
  async function choose(file?: File) {
    if (!file || controller.current) return;
    onReady(undefined); setSelected('');
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type) || file.size < 1 || file.size > 50 * 1024 * 1024) {
      setStatus('Choose an MP4, MOV or WebM video up to 50 MB.'); return;
    }
    const active = new AbortController(); controller.current = active;
    setStatus('Uploading your video…'); setProgress(0);
    try {
      const { uploadId, url } = await begin({ name: file.name, size: file.size, contentType: file.type }) as { uploadId: string; url: string };
      const storageId = await uploadVideo(url, file, setProgress, active.signal);
      active.signal.throwIfAborted();
      await finish({ uploadId, storageId });
      if (!active.signal.aborted) { setPreparing({ id: uploadId, name: file.name }); setStatus(`${file.name} is uploaded and being checked. It will become selectable when ready.`); }
    } catch (error) {
      const code = (error as { data?: string })?.data;
      if (active.signal.aborted) setStatus('Upload cancelled.');
      else if (code === 'UPLOAD_LIMIT') setStatus('Upload limit reached: five uploads per hour and ten saved sources. Remove an unused source or try again later.');
      else setStatus(error instanceof Error && error.message.startsWith('Upload ') ? error.message : 'The upload was not saved. Check your connection and try again.');
    }
    finally { if (controller.current === active) { controller.current = null; setProgress(undefined); } }
  }
  const uploading = progress !== undefined;
  const [dragging, setDragging] = useState(false);
  return <div className="sheet mt-4 p-3 text-sm sm:p-4">
    <label onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (!uploading) void choose(e.dataTransfer.files[0]); }}
      className={`relative flex cursor-pointer flex-col items-center gap-3 border-[1.5px] border-dashed px-4 py-7 text-center transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 ${dragging ? 'border-ink bg-paper2' : 'border-ink/50 hover:border-ink hover:bg-paper'}`}>
      <FilmStripArt />
      <span className="display text-3xl">{uploading ? 'Uploading…' : 'Drop your video here'}</span>
      <span className="text-sm text-muted">{uploading ? 'Keep this tab open' : 'or click to choose a file'}</span>
      <span className="flex flex-wrap justify-center gap-1.5">
        {['MP4, MOV or WebM', 'Up to 50 MB', '5 min', 'Free to upload'].map(chip => <span key={chip} className="border border-ink/30 bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink2">{chip}</span>)}
      </span>
      <input aria-label="Upload video" type="file" accept="video/mp4,video/quicktime,video/webm" disabled={uploading} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} className="sr-only" />
    </label>
    {uploading && <div className="mt-3 flex items-center gap-3">
      <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-2 flex-1 border border-ink bg-surface">
        <div className="h-full bg-ink transition-[width] duration-300 ease-paper" style={{ width: `${progress}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-xs">{Math.round(progress)}%</span>
      <button type="button" onClick={() => controller.current?.abort()} className="font-mono text-[11px] uppercase tracking-[0.06em] underline underline-offset-4 hover:text-signal">Cancel upload</button>
    </div>}
    {!!uploads?.length && <label className={`${label} mt-4 block`}>Or choose an uploaded video
      <select aria-label="Uploaded video" disabled={uploading} value={selected} onChange={e => { setSelected(e.target.value); onReady(e.target.value || undefined); setStatus(''); }} className={`${field} mt-1.5 block w-full normal-case tracking-normal`}>
        <option value="">Choose a video</option>
        {uploads.map(u => <option key={u._id} value={u._id}>{u.name} · {(u.size / 1048576).toFixed(1)} MB</option>)}
      </select>
    </label>}
    {probeStatuses?.filter(upload => upload.status === 'failed').map(upload => <div key={upload._id} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-signal">
      <WarningCircle aria-hidden="true" size={14} /><span>{upload.name} could not be prepared. </span><button type="button" className="font-medium text-ink underline underline-offset-4" onClick={async () => {
        try { await remove({ uploadId: upload._id }); setStatus('Failed upload removed.'); }
        catch { setStatus('Could not remove this upload.'); }
      }}>Remove failed upload</button>
    </div>)}
    {selected && <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink2 underline underline-offset-4 hover:text-signal" onClick={async () => {
      try { await remove({ uploadId: selected }); setSelected(''); onReady(undefined); setStatus('Upload removed. Finished videos are still available.'); }
      catch { setStatus('Could not remove this upload. Wait for any active edits to finish.'); }
    }}><Trash aria-hidden="true" size={14} />Remove uploaded source</button>}
    <p role="status" className={status ? 'mt-3 border-l-2 border-ink pl-2 text-sm' : ''}>{status}</p>
  </div>;
}

function FilmStripArt() {
  return <svg aria-hidden="true" viewBox="0 0 120 44" className="h-11 w-30 -rotate-3 text-ink" fill="none">
    <rect x="1" y="1" width="118" height="42" fill="currentColor" />
    {Array.from({ length: 10 }, (_, i) => <g key={i} fill="var(--paper)"><rect x={5 + i * 11.5} y="4" width="5" height="4" /><rect x={5 + i * 11.5} y="36" width="5" height="4" /></g>)}
    {[0, 1, 2].map(i => <rect key={i} x={7 + i * 37} y="11" width="32" height="22" fill={i === 1 ? 'var(--sheet)' : '#3a3a37'} />)}
    <path d="M60 16v12M54 22l6 6 6-6" stroke="currentColor" strokeWidth="1.6" />
  </svg>;
}
