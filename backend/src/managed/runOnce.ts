import { createManagedRenderer } from './render.js';
import { progressReporter, type RenderStage } from './progress.js';
import { renderMirror } from './firestoreProgress.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { type CaptionArchive } from '../media/captionArchive.js';
import { Storage } from '@google-cloud/storage';
import { uploadArtifacts, type Artifact } from './artifacts.js';
import { cleanupExpired } from './files.js';
import { renderExtras, type RenderText } from './extras.js';
import { runUploadProbe, type UploadProbeClaim } from './uploadProbe.js';
import { runWorker, validId, type ClaimedJob } from './worker.js';
import { ffprobe } from '../media/ffmpeg.js';
import { mediaMetadataFromProbe } from '../media/mediaMetadata.js';
import { insertAnalyticsRow } from '../google/bigquery.js';
import type { CloudRunIdentity } from './cloudRun.js';
export type RunOutcome = `worker_${Awaited<ReturnType<typeof runWorker>>}` | `upload_probe_${Awaited<ReturnType<typeof runUploadProbe>>}`;
export async function runOnce(identity: CloudRunIdentity, environment: Record<string, string | undefined>): Promise<RunOutcome> {
  const env = (key: string) => { const value = environment[key]; if (!value) throw Error(`${key} required`); return value; };
  const identityValue = 'jobId' in identity ? identity.jobId : identity.uploadId;
  if (!validId(identityValue)) throw Error('Invalid worker identifier');
  const workerSecret = env('WORKER_SECRET'); const workerId = randomUUID();
  const convex = new ConvexHttpClient(env('CONVEX_URL'), { logger: false, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }) });
  const progressClient = new ConvexHttpClient(env('CONVEX_URL'), { logger: false, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(3_000) }) });
  if ('uploadId' in identity) {
    const uploadCall = (name: string, args: Record<string, unknown>) => convex.mutation(makeFunctionReference<'mutation'>(`uploads:${name}`), { workerSecret, ...args });
    const result = await runUploadProbe(identity.uploadId, {
      claim: async () => await uploadCall('claimProbe', { uploadId: identity.uploadId, workerId }) as UploadProbeClaim | null,
      complete: async args => await uploadCall('completeProbe', { ...args }) as boolean,
      fail: async args => await uploadCall('failProbe', { ...args }) as boolean,
    });
    return `upload_probe_${result}`;
  }
  const jobId = identity.jobId;
  const bucket = new Storage().bucket(env('GCS_BUCKET'));
  const call = (name: string, args: Record<string, unknown>) => convex.mutation(makeFunctionReference<'mutation'>(`generate:${name}`), { workerSecret, ...args });
  const mirror = renderMirror(environment.FIRESTORE_PROJECT?.trim(), event => console.warn(event));
  const sendProgress = (job: ClaimedJob, stage: RenderStage) => {
    mirror.stage(job.jobId, stage);
    return progressClient.mutation(makeFunctionReference<'mutation'>('generate:reportProgress'), { workerSecret, jobId: job.jobId, leaseToken: job.leaseToken, stage }) as Promise<boolean>;
  };
  const leaseArgs = (job: ClaimedJob) => ({ jobId: job.jobId, leaseToken: job.leaseToken });
  // A warm service instance keeps /tmp, memory-backed on Cloud Run, between runs, and media/broll.ts and media/gifs.ts cache stock clips there with no eviction.
  for (const cache of ['takeone-broll-cache', 'takeone-gif-cache']) await rm(join(tmpdir(), cache), { recursive: true, force: true });
  await cleanupExpired(tmpdir());
  const work = await mkdtemp(join(tmpdir(), 'takeone-work-'));
  let captionArchive: CaptionArchive | undefined;
  let archivedKeys: { cleanStorageKey: string; captionStorageKey: string; sceneArchiveOnly?: boolean } | undefined;
  const renderText: RenderText = {};
  const telegram = async (method: string, body: object) => {
    const token = env('TELEGRAM_BOT_TOKEN');
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw Error('Telegram request failed');
    const data = await response.json() as { ok: boolean; result: { file_path?: string; file_size?: number } };
    if (!data.ok) throw Error('Telegram request failed'); return data.result;
  };
  try {
    const result = await runWorker(jobId, {
      claim: async () => await call('claimJob', { jobId, workerId }) as ClaimedJob | null,
      progress: async (job, stage, signal) => progressReporter(stage => sendProgress(job, stage), signal)(stage),
      heartbeat: async job => await call('heartbeat', leaseArgs(job)) as boolean,
      extras: (job, signal) => renderExtras(job, renderText, { bucket, work, log: event => console.warn(event) }, signal),
      complete: async (job, storageKey, metadata, extras) => {
        const accepted = await call('completeJob', { ...leaseArgs(job), storageKey, ...metadata, ...archivedKeys, ...extras }) as boolean;
        if (accepted) mirror.status(job.jobId, 'done');
        return accepted;
      },
      fail: async (job, error) => {
        const accepted = await call('failJob', { ...leaseArgs(job), error }) as boolean;
        if (accepted) mirror.status(job.jobId, 'failed');
        return accepted;
      },
      render: createManagedRenderer({ work, bucket, env, call, sendProgress,
        saveScenePlan: async (job, plan) => await convex.mutation(makeFunctionReference<'mutation'>('scenePlans:save'), { workerSecret, ...leaseArgs(job), plan }) as boolean,
        telegram, onArchive: archive => { captionArchive = archive; }, onText: (kind, text) => { renderText[kind] = text; } }),
      inspect: async (path, signal) => mediaMetadataFromProbe(await ffprobe(path, signal)),
      async upload(path, key, signal) {
        const artifacts: Artifact[] = [{ path, key, contentType: 'video/mp4' }];
        const archive = captionArchive ? {
          sceneArchiveOnly: captionArchive.sceneOnly,
          cleanStorageKey: key.slice(0, -4) + '-clean.mp4',
          captionStorageKey: key.replace(/^videos\//, 'captions/').replace(/\.mp4$/, '.json'),
        } : undefined;
        if (captionArchive && archive) artifacts.push(
          { path: captionArchive.videoPath, key: archive.cleanStorageKey, contentType: 'video/mp4' },
          { path: captionArchive.metadataPath, key: archive.captionStorageKey, contentType: 'application/json' },
        );
        await uploadArtifacts(bucket, artifacts, signal, event => console.warn(event));
        archivedKeys = archive;
      },
      // Convex schedules a durable Telegram delivery outbox after accepted completion.
      deliver: async () => {},
      cleanup: async () => { await rm(work, { recursive: true, force: true }); },
      log: event => console.warn(event),
      analytics: row => insertAnalyticsRow('renders', row, line => console.warn(line)),
    });
    return `worker_${result}`;
  } finally { await mirror.close(); await rm(work, { recursive: true, force: true }); }
}
