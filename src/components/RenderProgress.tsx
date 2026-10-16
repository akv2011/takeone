import { useEffect, useState } from 'react';

const labels = {
  script: 'Writing the script', narration: 'Recording narration',
  footage: 'Preparing footage', moments: 'Selecting highlights', source: 'Loading the source video',
  transcription: 'Timing captions to speech', cut: 'Building the cut',
  finishing: 'Adding captions and sound', checking: 'Checking the final video', saving: 'Saving the video',
};
export interface RenderAttempt {
  attempt: number; startedAt: number; finishedAt?: number;
  stages: { stage: keyof typeof labels; startedAt: number }[];
}
interface Props {
  job?: { _id: string; status: string; createdAt?: number; finishedAt?: number; refunded?: boolean; renderProgress?: RenderAttempt } | null;
}
const seconds = (start: number, end: number) => `${Math.max(0, Math.floor((end - start) / 1000))}s`;
export function RenderProgress({ job }: Props) {
  const [now, setNow] = useState(Date.now);
  const running = job?.status === 'processing';
  const queued = job?.status === 'queued' || job?.status === 'dispatched';
  useEffect(() => {
    if (!running && !queued) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job?._id, running, queued]);
  const progress = job?.renderProgress;
  const current = progress?.stages.at(-1);
  const message = !job ? 'Waiting for video details.'
    : job.status === 'queued' ? 'Waiting for a render slot.'
      : job.status === 'dispatched' ? 'Starting your render.'
        : running ? (current ? `${labels[current.stage]}.` : 'Preparing your render.')
          : job.status === 'done' ? 'Your video is ready.'
            : job.status === 'cancelled' ? 'Cancelled. Your allowance was restored.'
              : 'This render failed. Open a completed version to continue editing.';
  const end = progress?.finishedAt ?? job?.finishedAt ?? now;
  return <div>
    <h2 className="font-semibold">Render activity</h2>
    <p role="status" className="mt-1 text-muted">{message}</p>
    {job?.status === 'failed' && job.refunded && <p className="mt-1 text-muted">Your allowance was restored.</p>}
    {queued && job?.createdAt !== undefined && <p className="mt-1 text-xs text-muted">{seconds(job.createdAt, now)} since submitted{progress ? ' · Waiting to retry' : ''}</p>}
    {progress && !queued && <>
      <p className="mt-1 text-xs text-muted">Attempt {progress.attempt} · {seconds(progress.startedAt, end)} elapsed</p>
      <ol aria-label="Recorded render stages" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {progress.stages.map((entry, index) => {
          const next = progress.stages[index + 1];
          const complete = !!next || job?.status === 'done';
          return <li key={entry.stage} aria-current={running && !next ? 'step' : undefined} className={complete ? 'text-muted' : 'font-medium'}>
            <span>{complete ? '✓ ' : running ? '● ' : '○ '}{labels[entry.stage]}</span>
            <span className="ml-2 text-muted">{seconds(entry.startedAt, next?.startedAt ?? end)}{complete ? ' · Completed' : running ? ' · In progress' : ' · Stopped'}</span>
          </li>;
        })}
      </ol>
    </>}
  </div>;
}
