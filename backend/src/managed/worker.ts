import { telemetry } from './telemetry.js';
import type { Mode } from '../types.js';
import type { MediaMetadata } from '../media/mediaMetadata.js';
export interface ClaimedJob {
  timelineExport?: {
    profile: { container: 'mp4'; fps: 30 };
    timeline: {
      version: 1; aspect: '9:16' | '1:1' | '16:9'; durationMs: number;
      video: Array<{
        id: string; source: { kind: 'job'; jobId: string } | { kind: 'upload'; uploadId: string };
        sourceStartMs: number; sourceEndMs: number; timelineStartMs: number;
        fit: 'crop' | 'fit'; muted: boolean;
      }>;
      transitions: Array<{
        id: string; fromClipId: string; toClipId: string;
        type: 'cut' | 'crossfade' | 'fade' | 'dip-black'; durationMs: number;
      }>;
      text: never[]; graphics: never[];
    };
  };
  assemblySources?: Array<{
    source: { kind: 'job'; jobId: string } | { kind: 'upload'; uploadId: string };
    storageKey?: string; storageUrl?: string;
    durationMs: number; width: number; height: number; hasAudio: boolean;
  }>;
  speakerReframe?: boolean;
  sceneReplacement?: { index: number; uploadId: string; plan: import('../types.js').SavedScenePlan };
  brand?: import('../media/brand.js').Brand;
  hookTitle?: string;
  transforms?: import('../media/structuredEdit.js').EditTransforms;
  jobId: string; userId: string; mode: Mode; prompt: string; aspect: '9:16' | '1:1' | '16:9';
  queueWaitMs?: number;
  captionStyle?: 'none' | 'clean' | 'meme' | 'karaoke';
  generationKind?: 'stock' | 'ai'; aiOperation?: string;
  music?: { storageKey?: string; storageUrl?: string; volume: number; duck: boolean; replaceSourceAudio?: boolean };
  sourceCaptionStorageKey?: string;
  captionTexts?: string[];
  captionTransform?: boolean;
  captionFont?: 'sans' | 'serif' | 'mono';
  captionPosition?: 'auto' | 'top' | 'middle' | 'bottom';
  sourceUploadUrl?: string;
  sourceStorageKey?: string; telegramFileId?: string; telegramChatId?: string; isPro: boolean; leaseToken: string;
}
export interface WorkerDeps {
  claim(jobId: string): Promise<ClaimedJob | null>;
  progress?(job: ClaimedJob, stage: import('./progress.js').RenderStage, signal: AbortSignal): Promise<void>;
  heartbeat(job: ClaimedJob): Promise<boolean>;
  render(job: ClaimedJob, signal: AbortSignal): Promise<string>;
  inspect(path: string, signal: AbortSignal): Promise<MediaMetadata>;
  upload(path: string, storageKey: string, signal: AbortSignal): Promise<void>;
  complete(job: ClaimedJob, storageKey: string, metadata: MediaMetadata): Promise<boolean>;
  fail(job: ClaimedJob, error: string): Promise<boolean>;
  cleanup(): Promise<void>;
  deliver(job: ClaimedJob, storageKey: string): Promise<void>;
  log(event: string): void;
}
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export const validVideoKey = (value: unknown): value is string => typeof value === 'string' && /^videos\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.mp4$/.test(value);

/** One process, one durable lease, one artifact. An uncertain finalize is left to durable reconciliation. */
export async function runWorker(jobId: string, deps: WorkerDeps, heartbeatMs = 30_000, timeoutMs = 8 * 60_000): Promise<'skipped' | 'lost' | 'failed' | 'completed'> {
  if (!validId(jobId)) throw Error('Invalid job identifier');
  const metrics = telemetry(jobId, deps.log);
  const job = await metrics.time('claim', () => deps.claim(jobId));
  if (!job) { metrics.emit({ event: 'takeone.outcome', outcome: 'skipped' }); return 'skipped'; }
  if (Number.isFinite(job.queueWaitMs) && job.queueWaitMs! >= 0) metrics.emit({ event: 'takeone.queue_wait', durationMs: job.queueWaitMs });
  let outcome = 'interrupted';
  const controller = new AbortController();
  let lost = false;
  let ticking = false;
  let finalizing = false;
  const beat = async () => {
    if (ticking) return;
    ticking = true;
    try { if (!await deps.heartbeat(job)) { lost = true; controller.abort(); } }
    catch { lost = true; controller.abort(); }
    finally { ticking = false; }
  };
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  const timer = setInterval(() => { void beat(); }, heartbeatMs);
  try {
    if (job.jobId !== jobId || !validId(job.leaseToken)) throw Error('Invalid claim');
    const key = `videos/${job.jobId}/${job.leaseToken}.mp4`;
    const output = await metrics.time('render', () => deps.render(job, controller.signal));
    if (lost) { outcome = 'lost'; return 'lost'; }
    controller.signal.throwIfAborted();
    const metadata = await metrics.time('inspect', () => deps.inspect(output, controller.signal));
    if (lost) { outcome = 'lost'; return 'lost'; }
    controller.signal.throwIfAborted();
    await deps.progress?.(job, 'saving', controller.signal);
    await metrics.time('upload', () => deps.upload(output, key, controller.signal));
    if (lost) { outcome = 'lost'; return 'lost'; }
    controller.signal.throwIfAborted();
    finalizing = true;
    const accepted = await metrics.time('finalize', () => deps.complete(job, key, metadata));
    if (!accepted) { outcome = 'lost'; return 'lost'; }
    clearInterval(timer);
    try { await metrics.time('post_completion_hook', () => deps.deliver(job, key)); } catch { /* Stage telemetry records failure; the durable delivery outbox owns retries. */ }
    outcome = 'completed';
    return 'completed';
  } catch (error) {
    if (lost) { outcome = 'lost'; return 'lost'; }
    if (finalizing) { outcome = 'finalize_uncertain'; throw error; }
    const accepted = await deps.fail(job, 'Rendering failed. Please try again.');
    outcome = accepted ? 'failed' : 'lost';
    return accepted ? 'failed' : 'lost';
  } finally {
    clearInterval(timer);
    clearTimeout(deadline);
    controller.abort();
    try { await metrics.time('cleanup', () => deps.cleanup()); }
    finally { metrics.emit({ event: 'takeone.outcome', outcome }); }
  }
}
