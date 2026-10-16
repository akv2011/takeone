// GIPHY reaction stickers. Provider failure returns null; job cancellation propagates.
// Publish only complete, bounded GIF downloads to the versioned cache.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { Readable } from 'node:stream';
import { boundedDownload } from '../managed/files.js';
import { ffprobe } from './ffmpeg.js';
export const MAX_STICKER_BYTES = 20 * 1024 * 1024;
const timed = (signal: AbortSignal | undefined, ms: number) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);

const cacheDir = () => process.env.GIF_CACHE_DIR ?? join(tmpdir(), 'takeone-gif-cache');
export const stickerCacheKey = (q: string) => createHash('sha1').update(q.toLowerCase().trim()).digest('hex').slice(0, 16);

// pure: pick a sticker gif URL from a GIPHY /v1/stickers/search response
export function parseGiphy(json: any): string | null {
  for (const d of json?.data ?? []) {
    const url = d.images?.fixed_height?.url ?? d.images?.original?.url;
    if (url) return String(url);
  }
  return null;
}

export async function fetchSticker(query: string, signal?: AbortSignal): Promise<string | null> {
  signal?.throwIfAborted();
  if (!query.trim()) return null;
  const dir = cacheDir(), cached = join(dir, `v2-${stickerCacheKey(query)}.gif`);
  const info = await stat(cached).catch(() => null);
  signal?.throwIfAborted();
  if (info?.isFile() && info.size > 0 && info.size <= MAX_STICKER_BYTES) return cached;
  const key = process.env.GIPHY_API_KEY;
  if (!key) return null;
  const partial = join(dir, `${randomUUID()}.part`);
  let downloaded = false;
  try {
    const res = await fetch(`https://api.giphy.com/v1/stickers/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=3&rating=g`,
      { signal: timed(signal, 15_000) });
    if (!res.ok) return null;
    const url = parseGiphy(await res.json());
    signal?.throwIfAborted();
    if (!url) return null;
    const downloadSignal = timed(signal, 30_000);
    const gif = await fetch(url, { signal: downloadSignal });
    if (!gif.ok || !gif.body) { void gif.body?.cancel().catch(() => {}); return null; }
    if (Number(gif.headers.get('content-length')) > MAX_STICKER_BYTES) { void gif.body.cancel().catch(() => {}); return null; }
    await mkdir(dir, { recursive: true });
    await boundedDownload(Readable.fromWeb(gif.body as never), partial, MAX_STICKER_BYTES, downloadSignal);
    downloaded = true;
    const meta = await ffprobe(partial, downloadSignal);
    if (!meta.hasVideo || meta.videoCodec !== 'gif' || !Number.isFinite(meta.durationSec) || meta.durationSec <= 0 || meta.width < 2 || meta.height < 2) return null;
    downloadSignal.throwIfAborted();
    await rename(partial, cached);
    downloaded = false;
    signal?.throwIfAborted();
    return cached;
  } catch { signal?.throwIfAborted(); return null; }
  finally { if (downloaded) await rm(partial, { force: true }).catch(() => {}); }
}
