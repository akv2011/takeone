import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '../lib/convexApi';
import { button, panel } from '../lib/ui';
export function SpeakerReframe({ jobId, accountKey, duration }: { jobId: string; accountKey: string; duration?: number }) {
 return <ReframeForm key={`${accountKey}:${jobId}`} jobId={jobId} duration={duration} />;
}
function ReframeForm({ jobId, duration }: { jobId: string; duration?: number }) {
 const request = useMutation(api.speakerReframe.request), alive = useRef(true), lock = useRef(false), requestId = useRef<string | undefined>(undefined);
 const [pending, setPending] = useState(false), [error, setError] = useState(false), [result, setResult] = useState<string>();
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 async function submit() {
  if (lock.current) return; lock.current = true; setPending(true); setError(false); requestId.current ??= crypto.randomUUID();
  try { const next = await request({ sourceJobId: jobId, requestId: requestId.current }); if (alive.current) setResult(next.jobId); }
  catch { if (alive.current) setError(true); }
  finally { if (alive.current) { lock.current = false; setPending(false); } }
 }
 const tooLong = duration !== undefined && duration > 60;
 return <section aria-label="Follow speaker" className={`${panel} p-4`}>
  <h2 className="text-base font-semibold">Follow one speaker</h2>
  <p className="mt-1 text-sm text-muted">Turn a wider talking-head video into portrait. Sampled face positions guide a moving crop. Best for one clearly visible person, up to 60 seconds; cuts, multiple people and obscured faces may fail. Speech stays unchanged. Embedded captions can be cropped.</p>
  {tooLong && <p className="mt-2 text-xs text-warn">Trim this video to 60 seconds or less first.</p>}
  {result ? <Link className="mt-3 block text-sm font-semibold underline underline-offset-4" to={`/studio/${result}`}>Open portrait version</Link> : <button type="button" disabled={pending || tooLong} onClick={() => void submit()} className={`${button('primary', 'sm')} mt-3`}>{pending ? 'Creating portrait…' : 'Follow speaker · 1 generation'}</button>}
  {error && <p role="alert" className="mt-2 text-xs text-warn">Could not start this edit. Check your allowance and retry.</p>}
 </section>;
}
