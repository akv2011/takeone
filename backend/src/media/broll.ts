// Stock b-roll fetcher. Pexels -> Pixabay -> null (caller falls back to the gradient).
// Completed downloads are cached on disk keyed by normalized keywords so repeated topics cost zero
// API calls and zero bandwidth. No API keys -> returns null immediately (offline-safe).
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { boundedDownload } from '../managed/files.js';
import { ffprobe } from './ffmpeg.js';

export const MAX_STOCK_BYTES = 50 * 1024 * 1024;
const timed = (signal: AbortSignal | undefined, ms: number) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);

const cacheDir = () => process.env.BROLL_CACHE_DIR ?? join(tmpdir(), 'takeone-broll-cache');

export const brollCacheKey = (keywords: string[]) =>
  createHash('sha1').update(keywords.map((k) => k.toLowerCase().trim()).sort().join('|')).digest('hex').slice(0, 16);

// pure: pick the best portrait-leaning mp4 from a Pexels /videos/search response
export function parsePexels(json: any): string | null {
  for (const v of json?.videos ?? []) {
    const files = (v.video_files ?? [])
      .filter((f: any) => f.file_type === 'video/mp4' && f.height >= 720)
      .sort((a: any, b: any) => (b.height / b.width) - (a.height / a.width) || b.height - a.height);
    if (files[0]?.link) return String(files[0].link);
  }
  return null;
}

// pure: pick the best video URL from a Pixabay /api/videos response
export function parsePixabay(json: any): string | null {
  for (const h of json?.hits ?? []) {
    const v = h.videos?.large ?? h.videos?.medium ?? h.videos?.small;
    if (v?.url) return String(v.url);
  }
  return null;
}

async function pexelsUrl(query: string, signal?: AbortSignal): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3&orientation=portrait`,
    { headers: { Authorization: key }, signal: timed(signal, 15_000) });
  if (!res.ok) return null;
  return parsePexels(await res.json());
}

async function pixabayUrl(query: string, signal?: AbortSignal): Promise<string | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=3&safesearch=true`,
    { signal: timed(signal, 15_000) });
  if (!res.ok) return null;
  return parsePixabay(await res.json());
}

// Provider failures fall back; a cancelled job always stops rather than falling back.
export async function fetchStockBroll(keywords: string[], signal?: AbortSignal): Promise<string | null> {
  signal?.throwIfAborted();
  if (!keywords.length) return null;
  const dir = cacheDir();
  // Version the cache so old unvalidated/partially written files are not reused.
  const cached = join(dir, `v2-${brollCacheKey(keywords)}.mp4`);
  const info = await stat(cached).catch(() => null);
  signal?.throwIfAborted();
  if (info?.isFile() && info.size > 0 && info.size <= MAX_STOCK_BYTES) return cached;

  const query = keywords.slice(0, 4).join(' ');
  let url: string | null = null;
  try { url = await pexelsUrl(query, signal); } catch { signal?.throwIfAborted(); }
  signal?.throwIfAborted();
  if (!url) { try { url = await pixabayUrl(query, signal); } catch { signal?.throwIfAborted(); } }
  signal?.throwIfAborted();
  if (!url) return null;

  const partial = join(dir, `${randomUUID()}.part`);
  const downloadSignal = timed(signal, 60_000);
  let downloaded = false;
  try {
    const res = await fetch(url, { signal: downloadSignal });
    if (!res.ok || !res.body) { void res.body?.cancel().catch(() => {}); return null; }
    const length = Number(res.headers.get('content-length'));
    if (length > MAX_STOCK_BYTES) { void res.body.cancel().catch(() => {}); return null; }
    await mkdir(dir, { recursive: true });
    await boundedDownload(Readable.fromWeb(res.body as never), partial, MAX_STOCK_BYTES, downloadSignal);
    downloaded = true;
    const meta = await ffprobe(partial, downloadSignal);
    if (!meta.hasVideo || !Number.isFinite(meta.durationSec) || meta.durationSec <= 0 || meta.width < 2 || meta.height < 2) return null;
    downloadSignal.throwIfAborted();
    await rename(partial, cached);
    downloaded = false;
    signal?.throwIfAborted();
    return cached;
  } catch { signal?.throwIfAborted(); return null; }
  finally { if (downloaded) await rm(partial, { force: true }).catch(() => {}); }
}
