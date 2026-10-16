import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { boundedDownload } from './files.js';
import { ffprobe, type Probe } from '../media/ffmpeg.js';
import { mediaMetadataFromProbe } from '../media/mediaMetadata.js';

export interface UploadProbeClaim {
  uploadId: string; userId: string; storageId: string; storageUrl: string; size: number;
  probeToken: string; probeExpiresAt: number;
}
export interface UploadProbeCompletion {
  uploadId: string; storageId: string; probeToken: string;
  mediaDurationMs: number; mediaWidth: number; mediaHeight: number; mediaHasAudio: boolean;
}
interface UploadProbeDeps {
  claim(): Promise<UploadProbeClaim | null>;
  complete(args: UploadProbeCompletion): Promise<boolean>;
  fail(args: Pick<UploadProbeClaim, 'uploadId' | 'storageId' | 'probeToken'>): Promise<boolean>;
  fetch?: typeof globalThis.fetch;
  probe?: (path: string, signal?: AbortSignal) => Promise<Probe>;
}
export function workerIdentity(environment: Record<string, string | undefined>): { jobId: string } | { uploadId: string } {
  const jobId = environment.TAKEONE_JOB_ID;
  const uploadId = environment.TAKEONE_UPLOAD_ID;
  if ((!jobId && !uploadId) || (jobId && uploadId)) throw Error('Exactly one worker identity is required');
  return jobId ? { jobId } : { uploadId: uploadId! };
}
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export async function runUploadProbe(uploadId: string, deps: UploadProbeDeps): Promise<'not_claimed' | 'completed' | 'failed'> {
  const claim = await deps.claim();
  if (!claim) return 'not_claimed';
  const fence = { uploadId: claim.uploadId, storageId: claim.storageId, probeToken: claim.probeToken };
  if (claim.uploadId !== uploadId || claim.size < 1 || claim.size > MAX_UPLOAD_BYTES) { await deps.fail(fence); return 'failed'; }
  const work = await mkdtemp(join(tmpdir(), `takeone-probe-${createHash('sha256').update(uploadId).digest('hex').slice(0, 12)}-`));
  const path = join(work, 'source');
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(Error('Upload probe deadline exceeded')), Math.max(1, Math.min(60_000, claim.probeExpiresAt - Date.now())));
  try {
    const response = await (deps.fetch ?? fetch)(claim.storageUrl, { signal: controller.signal });
    if (!response.ok || !response.body) throw Error('Unable to download upload');
    await boundedDownload(Readable.fromWeb(response.body as any), path, MAX_UPLOAD_BYTES, controller.signal);
    if ((await stat(path)).size !== claim.size) throw Error('Upload size changed');
    const metadata = mediaMetadataFromProbe(await (deps.probe ?? ffprobe)(path, controller.signal));
    const accepted = await deps.complete({ ...fence, ...metadata });
    if (!accepted) await deps.fail(fence).catch(() => false);
    return accepted ? 'completed' : 'failed';
  } catch {
    await deps.fail(fence).catch(() => false);
    return 'failed';
  } finally {
    clearTimeout(deadline);
    await rm(work, { recursive: true, force: true });
  }
}
