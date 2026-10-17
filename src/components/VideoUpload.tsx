import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/convexApi';
import { uploadVideo } from '../lib/uploadVideo';
import { Trash, WarningCircle } from '@phosphor-icons/react';
import { button, field, label } from '../lib/ui';
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
  return <div className="mt-4 text-sm">
    <label onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (!uploading) void choose(e.dataTransfer.files[0]); }}
      className={`relative flex cursor-pointer flex-col items-center gap-3 rounded-card border-[1.5px] border-dashed px-6 py-9 text-center transition-[background-color,border-color] duration-150 ease-paper has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${dragging ? 'border-ink bg-surface' : 'border-ink/20 bg-surface/60 hover:border-ink/40 hover:bg-surface/85'}`}>
      <FilmStripArt />
      <span className="font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">{uploading ? 'Uploading your video' : dragging ? 'Drop it here' : 'Drop a video, or choose a file'}</span>
      <span className="text-[13px] text-muted">MP4, MOV or WebM, up to 50 MB and 5 minutes. Uploading is free.</span>
      <input aria-label="Upload video" type="file" accept="video/mp4,video/quicktime,video/webm" disabled={uploading} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} className="sr-only" />
    </label>
    {uploading && <div className="mt-3 flex items-center gap-3">
      <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-ink transition-[width] duration-300 ease-paper" style={{ width: `${progress}%` }} />
      </div>
      <span className="w-10 text-right text-[13px] tabular-nums text-ink2">{Math.round(progress)}%</span>
      <button type="button" onClick={() => controller.current?.abort()} className={button('ghost', 'sm')}>Cancel upload</button>
    </div>}
    {!!uploads?.length && <label className={`${label} mt-4 block`}>Or choose an uploaded video
      <select aria-label="Uploaded video" disabled={uploading} value={selected} onChange={e => { setSelected(e.target.value); onReady(e.target.value || undefined); setStatus(''); }} className={`${field} mt-1.5 block w-full`}>
        <option value="">Choose a video</option>
        {uploads.map(u => <option key={u._id} value={u._id}>{u.name} · {(u.size / 1048576).toFixed(1)} MB</option>)}
      </select>
    </label>}
    {probeStatuses?.filter(upload => upload.status === 'failed').map(upload => <div key={upload._id} className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink2">
      <WarningCircle aria-hidden="true" size={16} className="text-grease" /><span>{upload.name} could not be prepared.</span><button type="button" className="font-semibold text-ink underline-offset-4 hover:underline" onClick={async () => {
        try { await remove({ uploadId: upload._id }); setStatus('Failed upload removed.'); }
        catch { setStatus('Could not remove this upload.'); }
      }}>Remove failed upload</button>
    </div>)}
    {selected && <button type="button" className={`${button('ghost', 'sm')} mt-2 -ml-3`} onClick={async () => {
      try { await remove({ uploadId: selected }); setSelected(''); onReady(undefined); setStatus('Upload removed. Finished videos are still available.'); }
      catch { setStatus('Could not remove this upload. Wait for any active edits to finish.'); }
    }}><Trash aria-hidden="true" size={16} />Remove uploaded source</button>}
    <p role="status" className={status ? 'mt-3 text-sm text-ink2' : ''}>{status}</p>
  </div>;
}

function FilmStripArt() {
  return <svg aria-hidden="true" viewBox="0 0 132 52" className="h-[52px] w-[132px] -rotate-2 drop-shadow-[0_10px_14px_rgba(40,30,20,.22)]" fill="none">
    <rect x="0" y="0" width="132" height="52" rx="3" fill="#1b1814" />
    {Array.from({ length: 11 }, (_, i) => <g key={i} fill="#efebe3" opacity=".9"><rect x={5 + i * 11.6} y="3.5" width="6" height="4.5" rx=".8" /><rect x={5 + i * 11.6} y="44" width="6" height="4.5" rx=".8" /></g>)}
    {[0, 1, 2].map(i => <rect key={i} x={8 + i * 39} y="12" width="35" height="28" rx="1.5" fill={i === 1 ? '#fbfaf6' : '#3a352d'} />)}
    <path d="M66 19v13M60.5 26.5 66 32l5.5-5.5" stroke="#141311" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
