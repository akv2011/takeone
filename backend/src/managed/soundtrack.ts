import { Readable } from 'node:stream';
import { boundedDownload } from './files.js';
import type { ClaimedJob } from './worker.js';

// Sources come only from a claimed server snapshot, never from prompt text.
export async function downloadSoundtrack(music: NonNullable<ClaimedJob['music']>, path: string, signal: AbortSignal, catalogStream: (key: string) => Readable) {
  signal.throwIfAborted();
  if (music.storageKey && !music.storageUrl) {
    if (!/^music\/[a-zA-Z0-9_-]{1,100}\.(mp3|wav|m4a)$/.test(music.storageKey)) throw Error('Invalid music selection');
    await boundedDownload(catalogStream(music.storageKey), path, 20 * 1024 * 1024, signal);
    return;
  }
  if (!music.storageUrl || music.storageKey) throw Error('Invalid music selection');
  // Same rule as uploaded video sources: only the configured Convex deployment's storage, cloud or self-hosted.
  const url = new URL(music.storageUrl), deployment = process.env.CONVEX_URL ? new URL(process.env.CONVEX_URL) : undefined;
  if (!deployment || url.protocol !== 'https:' || url.origin !== deployment.origin || url.username || url.password || !/^\/api\/storage\/[a-zA-Z0-9_-]+$/.test(url.pathname)) throw Error('Invalid uploaded audio URL');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
  if (!response.ok || !response.body) throw Error('Audio download failed');
  await boundedDownload(Readable.fromWeb(response.body as never), path, 20 * 1024 * 1024, signal);
}
