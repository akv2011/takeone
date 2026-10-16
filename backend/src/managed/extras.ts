import { join } from 'node:path';
import type { Bucket } from '@google-cloud/storage';
import { checkClaims, type ClaimsCheck } from '../claims.js';
import { generateCoverImage } from '../google/coverImage.js';
import { uploadArtifacts } from './artifacts.js';
import type { ClaimedJob } from './worker.js';

export const EXTRAS_TIMEOUT_MS = 40_000;
export interface RenderText { captions?: string; hook?: string }
export interface Extras { claims?: ClaimsCheck; coverStorageKey?: string }
interface ExtrasDeps { bucket: Pick<Bucket, 'file'>; work: string; log(event: string): void }

/** The hook, else the prompt of a new video. An edit's prompt is an instruction, so an edit without a hook gets no cover. */
function coverSubject(job: ClaimedJob, text: RenderText): string | undefined {
  const subject = (text.hook ?? job.hookTitle ?? (job.mode === 'edit' ? '' : job.prompt.replace(/https?:\/\/\S+/g, ''))).trim();
  return subject || undefined;
}

async function cover(job: ClaimedJob, subject: string, deps: ExtrasDeps, signal: AbortSignal): Promise<string> {
  const key = `videos/${job.jobId}/${job.leaseToken}-cover.png`, path = join(deps.work, 'takeone-cover.png');
  await generateCoverImage(`A vertical 9:16 cover image for a short video about: ${subject.slice(0, 300)}. One clear subject, bold simple composition. No words, letters, logos or watermarks.`, path, signal);
  await uploadArtifacts(deps.bucket, [{ path, key, contentType: 'image/png' }], signal, deps.log);
  return key;
}

/**
 * Claims check and cover image for a finished render. Best effort: resolves by the deadline and
 * never rejects, so a provider problem cannot fail the job or hold its completion longer.
 */
export async function renderExtras(job: ClaimedJob, text: RenderText, deps: ExtrasDeps, jobSignal: AbortSignal, timeoutMs = EXTRAS_TIMEOUT_MS): Promise<Extras> {
  const signal = AbortSignal.any([jobSignal, AbortSignal.timeout(timeoutMs)]);
  const deadline = new Promise<undefined>(resolve => signal.aborted ? resolve(undefined) : signal.addEventListener('abort', () => resolve(undefined), { once: true }));
  const attempt = <T>(name: string, work: () => Promise<T>) => Promise.race([work().catch((error: unknown) => {
    deps.log(JSON.stringify({ event: `takeone.${name}_unavailable`, reason: error instanceof Error ? error.message : 'unknown' }));
    return undefined;
  }), deadline]);
  const spoken = text.captions?.trim(), subject = coverSubject(job, text);
  const [claims, coverStorageKey] = await Promise.all([
    spoken ? attempt('claims', () => checkClaims(spoken, signal)).then(result => result ?? { status: 'unavailable' as const }) : undefined,
    process.env.IMAGE_MODEL?.trim() && subject ? attempt('cover', () => cover(job, subject, deps, signal)) : undefined,
  ]);
  return { ...(claims && { claims }), ...(coverStorageKey && { coverStorageKey }) };
}
