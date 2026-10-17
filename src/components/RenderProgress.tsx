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
const FRAMES = 7;
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
  if (status === 'done') return FRAMES;
  if (!stage) return status === 'dispatched' || status === 'processing' ? 1 : 0;
  return 1 + Math.ceil((pipeline.indexOf(stage) + 1) / 2);
}
// One film frame per lit step; the next frame develops while a stage runs.
export function FilmFrames({ lit, running, stopped, className = '' }: { lit: number; running?: boolean; stopped?: boolean; className?: string }) {
  return <div aria-hidden="true" data-lit={lit} className={`relative flex gap-[3px] bg-ink px-[3px] py-[7px] ${stopped ? 'opacity-40' : ''} ${className}`}>
    <span className="absolute inset-x-0 top-[2px] h-[3px] bg-[repeating-linear-gradient(90deg,var(--paper)_0_3px,transparent_3px_7px)]" />
    <span className="absolute inset-x-0 bottom-[2px] h-[3px] bg-[repeating-linear-gradient(90deg,var(--paper)_0_3px,transparent_3px_7px)]" />
    {Array.from({ length: FRAMES }, (_, index) => <span key={index}
      className={`h-full min-h-3 flex-1 transition-colors duration-500 ease-paper ${index < lit ? 'bg-surface' : running && index === lit ? 'bg-surface/40 motion-safe:animate-pulse' : 'bg-ink2'}`} />)}
  </div>;
}

function useRenderState(job: Props['job']) {
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
  const lit = litBars(job?.status, queued ? undefined : current?.stage);
  const stopped = job?.status === 'failed' || job?.status === 'cancelled';
  return { now, running, queued, progress, current, lit, stopped };
}

/** Compact strip for a video card: the frames plus the current stage, no history. */
export function RenderStrip({ job }: Props) {
  const { running, queued, current, lit, stopped } = useRenderState(job);
  const stage = queued ? (job?.status === 'queued' ? 'Waiting for a slot' : 'Starting') : running ? (current ? labels[current.stage] : 'Preparing') : stopped ? 'Stopped' : 'Finishing';
  return <div className="w-full">
    <FilmFrames lit={lit} running={running} stopped={stopped} className="h-7" />
    <p className="mt-2 font-mono text-[10px] uppercase leading-tight tracking-[0.08em] text-surface">{stage}</p>
  </div>;
}

export function RenderProgress({ job }: Props) {
  const { now, running, queued, progress, current, lit, stopped } = useRenderState(job);
  const message = !job ? 'Waiting for video details.'
    : job.status === 'queued' ? 'Waiting for a render slot.'
      : job.status === 'dispatched' ? 'Starting your render.'
        : running ? (current ? `${labels[current.stage]}.` : 'Preparing your render.')
          : job.status === 'done' ? 'Your video is ready.'
            : job.status === 'cancelled' ? 'Cancelled. Your allowance was restored.'
              : 'This render failed. Open a completed version to continue editing.';
  const end = progress?.finishedAt ?? job?.finishedAt ?? now;
  return <div>
    <h2 className="eyebrow">Render activity</h2>
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      <FilmFrames lit={lit} running={running} stopped={stopped} className="h-8 w-48 shrink-0 sm:w-60" />
      <p role="status" className="font-display text-xl leading-tight">{message}</p>
    </div>
    {job?.status === 'failed' && job.refunded && <p className="mt-1 text-sm text-muted">Your allowance was restored.</p>}
    {queued && job?.createdAt !== undefined && <p className="mt-2 font-mono text-xs text-muted">{seconds(job.createdAt, now)} since submitted{progress ? ' · Waiting to retry' : ''}</p>}
    {progress && !queued && <>
      <p className="mt-2 font-mono text-xs text-muted">Attempt {progress.attempt} · {seconds(progress.startedAt, end)} elapsed</p>
      <ol aria-label="Recorded render stages" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {progress.stages.map((entry, index) => {
          const next = progress.stages[index + 1];
          const complete = !!next || job?.status === 'done';
          return <li key={entry.stage} aria-current={running && !next ? 'step' : undefined} className={`border-l pl-2 ${complete ? 'border-line text-muted' : 'border-ink font-medium text-ink'}`}>
            <span><span aria-hidden="true" className={complete ? 'text-go' : running ? 'text-signal' : ''}>{complete ? '✓ ' : running ? '● ' : '○ '}</span>{labels[entry.stage]}</span>
            <span className="ml-2 font-mono text-muted">{seconds(entry.startedAt, next?.startedAt ?? end)}{complete ? ' · Completed' : running ? ' · In progress' : ' · Stopped'}</span>
          </li>;
        })}
      </ol>
    </>}
  </div>;
}
