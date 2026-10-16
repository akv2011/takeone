import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../lib/convexApi';
import { uploadVideo } from '../lib/uploadVideo';
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
      setStatus(`${preparing.name} is ready. Describe your edit, then create your video.`);
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
      else setStatus(error instanceof Error && error.message.startsWith('Upload ') ? error.message : 'Could not save this upload. Please try again.');
    }
    finally { if (controller.current === active) { controller.current = null; setProgress(undefined); } }
  }
  return <div className="mt-4 space-y-2 rounded-xl border bg-white p-4 text-sm">
    <label className="block font-semibold">Your video
      <input aria-label="Upload video" type="file" accept="video/mp4,video/quicktime,video/webm" disabled={progress !== undefined} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} className="mt-2 block w-full" />
    </label>
    <p className="text-xs text-muted">MP4, MOV or WebM · up to 50 MB and 5 minutes. Uploading uses no video allowance.</p>
    {progress !== undefined && <><progress aria-label="Upload progress" value={progress} max={100} /><button onClick={() => controller.current?.abort()} className="ml-3 underline">Cancel upload</button></>}
    {!!uploads?.length && <label className="block">Or choose an uploaded video
      <select aria-label="Uploaded video" disabled={progress !== undefined} value={selected} onChange={e => { setSelected(e.target.value); onReady(e.target.value || undefined); setStatus(''); }} className="mt-1 block w-full rounded-lg border p-2">
        <option value="">Choose a video</option>
        {uploads.map(u => <option key={u._id} value={u._id}>{u.name} · {(u.size / 1048576).toFixed(1)} MB</option>)}
      </select>
    </label>}
    {probeStatuses?.filter(upload => upload.status === 'failed').map(upload => <div key={upload._id} className="text-xs">
      <span>{upload.name} could not be prepared. </span><button className="underline" onClick={async () => {
        try { await remove({ uploadId: upload._id }); setStatus('Failed upload removed.'); }
        catch { setStatus('Could not remove this upload.'); }
      }}>Remove failed upload</button>
    </div>)}
    {selected && <button className="text-xs underline" onClick={async () => {
      try { await remove({ uploadId: selected }); setSelected(''); onReady(undefined); setStatus('Upload removed. Finished videos are still available.'); }
      catch { setStatus('Could not remove this upload. Wait for any active edits to finish.'); }
    }}>Remove uploaded source</button>}
    <p role="status">{status}</p>
  </div>;
}
