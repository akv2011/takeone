import { TextT } from "@phosphor-icons/react";
import { InspectorSection, GenerationTicket } from "./StudioWorkspace";
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { api } from '../lib/convexApi';
import { button, field, label, panel } from '../lib/ui';

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
  return <InspectorSection title="Opening hooks" icon={TextT} help="Three opening titles over the same video. Footage and speech stay unchanged. Preview is free. Creating three versions uses three generations."><section aria-label="Opening hook variants" className={`${panel} p-4`}>
    {titles.map((title, index) => <div key={index} className="mt-3">
      <label className={`block ${label}`}>Hook {index + 1}<input value={title} maxLength={100} disabled={pending || !!jobs.length} onChange={event => { setTitles(values => values.map((v, i) => i === index ? event.target.value : v)); requestId.current = undefined; }} className={`${field} mt-1 w-full`} placeholder={['Lead with a question…', 'Start with the benefit…', 'Challenge an assumption…'][index]} /></label>
      <button type="button" disabled={!videoUrl || title.trim().length < 3} onClick={() => { setPreview(index); setTime(0); if (player.current) { player.current.pause(); player.current.currentTime = 0; } }} className={`${button('secondary', 'sm')} mt-1.5`}>Preview hook {index + 1} · free</button>
    </div>)}
    {preview !== undefined && videoUrl && <div className="relative mt-3 overflow-hidden  bg-ink">
      <video ref={player} src={videoUrl} controls playsInline onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} className="max-h-72 w-full focus-visible:outline-cue focus-visible:-outline-offset-2" aria-label="Opening title preview" />
      {time < titleEnd && <div className="pointer-events-none absolute left-[8%] right-[8%] top-[10%] break-words text-center text-lg font-extrabold text-surface [text-shadow:1px_1px_2px_black]">{titles[preview]}</div>}
      <p className="p-2 text-xs text-surface/80">Approximate title layout. Press play to preview.</p>
    </div>}
    {!jobs.length && <button type="button" disabled={!valid || pending} onClick={() => void submit()} className={`${button('primary', 'sm')} mt-4`}>{pending ? 'Creating versions…' : <>Create 3 versions <GenerationTicket count={3} /></>}</button>}
    {error && <p role="alert" className="mt-2 text-xs text-warn">{error}</p>}
    {!!jobs.length && <ul className="mt-3 space-y-2 text-sm">{jobs.map((id, i) => <li key={id}><Link className="font-semibold underline underline-offset-4" to={`/studio/${id}`}>Open hook {i + 1}</Link></li>)}</ul>}
  </section></InspectorSection>;
}
