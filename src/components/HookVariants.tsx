import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { api } from '../lib/convexApi';

export function HookVariants({ jobId, accountKey, videoUrl }: { jobId: string; accountKey: string; videoUrl?: string }) {
  return <HookForm key={`${accountKey}:${jobId}`} jobId={jobId} videoUrl={videoUrl} />;
}
function HookForm({ jobId, videoUrl }: { jobId: string; videoUrl?: string }) {
  const request = useMutation(api.hookVariants.request);
  const [titles, setTitles] = useState(['', '', '']);
  const [preview, setPreview] = useState<number>();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const [jobs, setJobs] = useState<string[]>([]);
  const alive = useRef(true), lock = useRef(false), requestId = useRef<string | undefined>(undefined);
  const player = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0), [duration, setDuration] = useState(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const valid = titles.every(t => t.trim().length >= 3 && t.length <= 100) && new Set(titles.map(t => t.trim().replace(/\s+/g, ' ').toLowerCase())).size === 3;
  const titleEnd = Math.min(3, Math.max(1.5, duration * 0.25));
  async function submit() {
    if (lock.current || !valid) return;
    lock.current = true; setPending(true); setError('');
    requestId.current ??= crypto.randomUUID();
    try { const result = await request({ sourceJobId: jobId, titles, requestId: requestId.current }); if (alive.current) setJobs(result.jobIds); }
    catch { if (alive.current) setError('Could not create all three versions. Check your allowance and active jobs, then retry.'); }
    finally { if (alive.current) { lock.current = false; setPending(false); } }
  }
  return <section aria-label="Opening hook variants" className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
    <h2 className="text-sm font-semibold">Try three opening hooks</h2>
    <p className="mt-1 text-xs text-muted">Three opening titles over the same video. Footage and speech stay unchanged. Preview is free; export uses 3 generations.</p>
    {titles.map((title, index) => <div key={index} className="mt-3">
      <label className="block text-xs">Hook {index + 1}<input value={title} maxLength={100} disabled={pending || !!jobs.length} onChange={event => { setTitles(values => values.map((v, i) => i === index ? event.target.value : v)); requestId.current = undefined; }} className="mt-1 w-full rounded-lg border p-2 text-sm" placeholder={['Lead with a question', 'Start with the benefit', 'Challenge an assumption'][index]} /></label>
      <button type="button" disabled={!videoUrl || title.trim().length < 3} onClick={() => { setPreview(index); setTime(0); if (player.current) { player.current.pause(); player.current.currentTime = 0; } }} className="mt-1 rounded border px-2 py-1 text-xs">Preview hook {index + 1} · free</button>
    </div>)}
    {preview !== undefined && videoUrl && <div className="relative mt-3 overflow-hidden rounded-lg bg-black">
      <video ref={player} src={videoUrl} controls playsInline onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} className="max-h-72 w-full" aria-label="Opening title preview" />
      {time < titleEnd && <div className="pointer-events-none absolute left-[8%] right-[8%] top-[10%] break-words text-center text-lg font-extrabold text-yellow-300 [text-shadow:1px_1px_2px_black]">{titles[preview]}</div>}
      <p className="p-2 text-xs text-white">Approximate title layout. Press play to preview.</p>
    </div>}
    {!jobs.length && <button type="button" disabled={!valid || pending} onClick={() => void submit()} className="mt-4 rounded-lg bg-ink px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? 'Creating versions…' : 'Create 3 versions · 3 generations'}</button>}
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {!!jobs.length && <ul className="mt-3 space-y-2 text-sm">{jobs.map((id, i) => <li key={id}><Link className="underline" to={`/studio/${id}`}>Open hook {i + 1}</Link></li>)}</ul>}
  </section>;
}
