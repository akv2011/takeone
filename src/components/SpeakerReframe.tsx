import { UserFocus } from "@phosphor-icons/react";
import { InspectorSection, GenerationCost } from "./StudioWorkspace";
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
 return <InspectorSection title="Follow speaker" icon={UserFocus} help="Turn a wider talking-head video into portrait with a moving crop. Best for one clearly visible person up to 60 seconds. Cuts, multiple people and obscured faces may fail. Speech stays unchanged. Embedded captions can be cropped."><section aria-label="Follow speaker" className={`${panel} p-4`}>
  {tooLong && <p className="mt-2 text-[13px] text-warn">Trim this video to 60 seconds or less first.</p>}
  {result ? <Link className="mt-3 block text-sm font-semibold underline underline-offset-4" to={`/studio/${result}`}>Open portrait version</Link> : <div className="studio-cost-action"><button type="button" disabled={pending || tooLong} onClick={() => void submit()} className={`${button('primary', 'sm')} mt-3`}>{pending ? 'Creating portrait…' : 'Follow speaker'}</button><GenerationCost /></div>}
  {error && <p role="alert" className="mt-2 text-[13px] text-warn">Could not start this edit. Check your allowance and retry.</p>}
 </section></InspectorSection>;
}
