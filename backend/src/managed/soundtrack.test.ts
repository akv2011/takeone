import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { downloadSoundtrack } from './soundtrack.js';
beforeEach(() => { vi.stubEnv('CONVEX_URL', 'https://staging.convex.cloud'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const source = { storageUrl: 'https://staging.convex.cloud/api/storage/file-id', volume: 0.2, duck: true };
test.each(['http://staging.convex.cloud/api/storage/file', 'https://evil.test/api/storage/file', 'https://staging.convex.cloud/api/other/file', 'https://staging.convex.cloud.evil.test/api/storage/file', 'https://user:pass@staging.convex.cloud/api/storage/file'])('rejects untrusted audio URL %s before fetch', async storageUrl => {
 const request = vi.fn(); vi.stubGlobal('fetch', request);
 await expect(downloadSoundtrack({ ...source, storageUrl }, '/tmp/unused-audio', new AbortController().signal, vi.fn())).rejects.toThrow('Invalid');
 expect(request).not.toHaveBeenCalled();
});
test('owned audio streams to disk with redirect rejection and cancellation', async () => {
 const work = await mkdtemp(join(tmpdir(), 'takeone-audio-'));
 try {
  const request = vi.fn().mockResolvedValue(new Response('audio')); vi.stubGlobal('fetch', request);
  const catalog = vi.fn(), signal = new AbortController().signal;
  await downloadSoundtrack(source, join(work, 'track'), signal, catalog);
  expect(await readFile(join(work, 'track'), 'utf8')).toBe('audio');
  expect(request.mock.calls[0][1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
  expect(catalog).not.toHaveBeenCalled();
  const aborted = new AbortController(); aborted.abort();
  await expect(downloadSoundtrack(source, join(work, 'cancelled'), aborted.signal, catalog)).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
 } finally { await rm(work, { recursive: true, force: true }); }
});
test('stream cap rejects oversized audio with a false content-length', async () => {
 const work = await mkdtemp(join(tmpdir(), 'takeone-audio-'));
 try {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(20 * 1024 * 1024 + 1), { headers: { 'content-length': '1' } })));
  const path = join(work, 'track');
  await expect(downloadSoundtrack(source, path, new AbortController().signal, vi.fn())).rejects.toThrow('size limit');
  await expect(readFile(path)).rejects.toThrow();
 } finally { await rm(work, { recursive: true, force: true }); }
});
test('catalog streams from scoped GCS keys; mixed sources are rejected', async () => {
 const work = await mkdtemp(join(tmpdir(), 'takeone-audio-'));
 try {
  const catalog = vi.fn(() => Readable.from(['catalog']));
  await downloadSoundtrack({ storageKey: 'music/upbeat.mp3', volume: 0.2, duck: true }, join(work, 'track'), new AbortController().signal, catalog);
  expect(catalog).toHaveBeenCalledWith('music/upbeat.mp3');
  await expect(downloadSoundtrack({ ...source, storageKey: 'music/upbeat.mp3' }, join(work, 'mixed'), new AbortController().signal, catalog)).rejects.toThrow('Invalid');
 } finally { await rm(work, { recursive: true, force: true }); }
});

test('owned audio from a self-hosted deployment is accepted only for the configured origin', async () => {
 const work = await mkdtemp(join(tmpdir(), 'takeone-audio-'));
 try {
  vi.stubEnv('CONVEX_URL', 'https://convex-api-example-uc.a.run.app');
  const request = vi.fn().mockResolvedValue(new Response('audio')); vi.stubGlobal('fetch', request);
  await downloadSoundtrack({ ...source, storageUrl: 'https://convex-api-example-uc.a.run.app/api/storage/file-id' }, join(work, 'track'), new AbortController().signal, vi.fn());
  expect(await readFile(join(work, 'track'), 'utf8')).toBe('audio');
  await expect(downloadSoundtrack(source, join(work, 'cloud'), new AbortController().signal, vi.fn())).rejects.toThrow('Invalid uploaded audio URL');
  expect(request).toHaveBeenCalledTimes(1);
 } finally { await rm(work, { recursive: true, force: true }); }
});
test('owned audio fails closed without a configured deployment', async () => {
 vi.stubEnv('CONVEX_URL', '');
 const request = vi.fn(); vi.stubGlobal('fetch', request);
 await expect(downloadSoundtrack(source, '/tmp/unused-audio', new AbortController().signal, vi.fn())).rejects.toThrow('Invalid uploaded audio URL');
 expect(request).not.toHaveBeenCalled();
});
