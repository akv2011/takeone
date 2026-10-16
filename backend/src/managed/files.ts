import { createWriteStream } from 'node:fs';
import { readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
/** Byte cap is enforced while streaming, even when content-length is absent or false. */
export async function boundedDownload(source: Readable, path: string, maxBytes: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) { source.destroy(); signal.throwIfAborted(); }
  const destination = createWriteStream(path, { flags: 'wx' });
  let created = false;
  // pipeline waits for the file stream to close on error. Only an emitted open
  // proves this invocation created the file; EEXIST must preserve the other file.
  destination.once('open', () => { created = true; });
  let bytes = 0;
  const cap = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    callback(bytes > maxBytes ? Error('Source exceeds size limit') : null, chunk);
  } });
  try { await pipeline(source, cap, destination, { signal }); }
  catch (error) { if (created) await rm(path, { force: true }); throw error; }
}
export async function cleanupExpired(root: string, now = Date.now(), ttlMs = 60 * 60_000): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.name.startsWith('takeone-work-')) continue;
    const path = join(root, entry.name);
    const info = await stat(path).catch(() => null);
    if (info && now - info.mtimeMs > ttlMs) await rm(path, { recursive: true, force: true });
  }
}
