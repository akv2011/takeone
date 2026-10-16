import { useEffect, useState } from 'react';
import { doc, getFirestore, onSnapshot, type DocumentData } from 'firebase/firestore';
import { app } from '../lib/firebase';

// Created here rather than in lib/firebase so the Firestore SDK loads with Studio, not with every page.
const firestore = app && getFirestore(app);

const labels = {
  script: 'Writing the script', narration: 'Recording narration',
  footage: 'Preparing footage', moments: 'Selecting highlights', source: 'Loading the source video',
  transcription: 'Timing captions to speech', cut: 'Building the cut',
  finishing: 'Adding captions and sound', checking: 'Checking the final video', saving: 'Saving the video',
};
const pipeline = Object.keys(labels) as (keyof typeof labels)[];
const bars = ['bg-bar-white', 'bg-bar-yellow', 'bg-bar-cyan', 'bg-bar-green', 'bg-bar-magenta', 'bg-bar-red', 'bg-bar-blue'];
export interface RenderAttempt {
  attempt: number; startedAt: number; finishedAt?: number;
  stages: { stage: keyof typeof labels; startedAt: number }[];
}
interface Props {
  job?: { _id: string; status: string; createdAt?: number; finishedAt?: number; refunded?: boolean; renderProgress?: RenderAttempt } | null;
}
type Stage = keyof typeof labels;
type Live = { stages: Stage[]; at: number } | null;
/** `renders/{jobId}` keeps `stages` across retries, so the current attempt ends at `stage`. */
function parseLive(data: DocumentData | undefined): Live {
  const stages = (Array.isArray(data?.stages) ? data.stages : []).filter((s): s is Stage => typeof s === 'string' && Object.hasOwn(labels, s));
  const cut = stages.findIndex(s => s === data?.stage);
  const current = cut < 0 ? stages : stages.slice(0, cut + 1);
  return current.length ? { stages: current, at: typeof data?.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : Date.now() } : null;
}
function useLiveStages(jobId: string | undefined, running: boolean): Live {
  const [live, setLive] = useState<Live>(null);
  useEffect(() => {
    if (!firestore || !jobId || !running) return;
    const stop = onSnapshot(doc(firestore, 'renders', jobId), snap => setLive(parseLive(snap.data())), () => setLive(null));
    return () => { stop(); setLive(null); };
  }, [jobId, running]);
  return running ? live : null;
}
function fromLive(live: NonNullable<Live>, recorded?: RenderAttempt): RenderAttempt {
  const stages = live.stages.map(stage => ({ stage, startedAt: recorded?.stages.find(entry => entry.stage === stage)?.startedAt ?? live.at }));
  return { attempt: recorded?.attempt ?? 1, startedAt: recorded?.startedAt ?? stages[0].startedAt, finishedAt: recorded?.finishedAt, stages };
}
const seconds = (start: number, end: number) => `${Math.max(0, Math.floor((end - start) / 1000))}s`;
/** Bars lit by pipeline position, not by time. Paths skip stages, so this never claims a percentage. */
function litBars(status: string | undefined, stage?: keyof typeof labels) {
  if (status === 'done') return bars.length;
  if (!stage) return status === 'dispatched' || status === 'processing' ? 1 : 0;
  return 1 + Math.ceil((pipeline.indexOf(stage) + 1) / 2);
}
export function RenderProgress({ job }: Props) {
  const [now, setNow] = useState(Date.now);
  const running = job?.status === 'processing';
  const queued = job?.status === 'queued' || job?.status === 'dispatched';
  useEffect(() => {
    if (!running && !queued) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job?._id, running, queued]);
  const live = useLiveStages(job?._id, running);
  const progress = live ? fromLive(live, job?.renderProgress) : job?.renderProgress;
  const current = progress?.stages.at(-1);
  const message = !job ? 'Waiting for video details.'
    : job.status === 'queued' ? 'Waiting for a render slot.'
      : job.status === 'dispatched' ? 'Starting your render.'
        : running ? (current ? `${labels[current.stage]}.` : 'Preparing your render.')
          : job.status === 'done' ? 'Your video is ready.'
            : job.status === 'cancelled' ? 'Cancelled. Your allowance was restored.'
              : 'This render failed. Open a completed version to continue editing.';
  const end = progress?.finishedAt ?? job?.finishedAt ?? now;
  const lit = litBars(job?.status, queued ? undefined : current?.stage);
  const stopped = job?.status === 'failed' || job?.status === 'cancelled';
  return <div>
    <h2 className="text-base font-semibold">Render activity</h2>
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div aria-hidden="true" data-lit={lit} className={`flex h-4 w-44 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-ink/20 sm:w-56 ${stopped ? 'opacity-40' : ''}`}>
        {bars.map((color, index) => <span key={color} className={`flex-1 ${index < lit ? color : running && index === lit ? 'bg-ink/25 motion-safe:animate-pulse' : 'bg-line'}`} />)}
      </div>
      <p role="status" className="text-sm font-semibold">{message}</p>
    </div>
    {job?.status === 'failed' && job.refunded && <p className="mt-1 text-sm text-muted">Your allowance was restored.</p>}
    {queued && job?.createdAt !== undefined && <p className="mt-2 text-xs text-muted">{seconds(job.createdAt, now)} since submitted{progress ? ' · Waiting to retry' : ''}</p>}
    {progress && !queued && <>
      <p className="mt-2 text-xs text-muted">Attempt {progress.attempt} · {seconds(progress.startedAt, end)} elapsed</p>
      <ol aria-label="Recorded render stages" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {progress.stages.map((entry, index) => {
          const next = progress.stages[index + 1];
          const complete = !!next || job?.status === 'done';
          return <li key={entry.stage} aria-current={running && !next ? 'step' : undefined} className={complete ? 'text-muted' : 'font-semibold text-ink'}>
            <span><span aria-hidden="true" className={complete ? 'text-go' : ''}>{complete ? '✓ ' : running ? '● ' : '○ '}</span>{labels[entry.stage]}</span>
            <span className="ml-2 text-muted">{seconds(entry.startedAt, next?.startedAt ?? end)}{complete ? ' · Completed' : running ? ' · In progress' : ' · Stopped'}</span>
          </li>;
        })}
      </ol>
    </>}
  </div>;
}
