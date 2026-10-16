import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('node:crypto', async importOriginal => { const actual = await importOriginal<typeof import('node:crypto')>(); return { ...actual, randomUUID: vi.fn(actual.randomUUID) }; });
import { randomUUID } from 'node:crypto';
vi.mock('./ffmpeg.js', () => ({ ffprobe: vi.fn() }));
import { ffprobe } from './ffmpeg.js';
import { fetchSticker, stickerCacheKey, MAX_STICKER_BYTES } from './gifs.js';
let dir: string;
const search = () => Response.json({ data: [{ images: { fixed_height: { url: 'https://media.example/clip.gif' } } }] });
beforeEach(async () => {
 dir = await mkdtemp(join(tmpdir(), 'stock-test-')); vi.stubEnv('GIF_CACHE_DIR', dir); vi.stubEnv('GIPHY_API_KEY', 'fixture'); vi.stubEnv('PIXABAY_API_KEY', '');
 vi.mocked(ffprobe).mockResolvedValue({ hasVideo: true, hasAudio: false, width: 720, height: 1280, durationSec: 10, videoCodec: 'gif' });
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); await rm(dir, { recursive: true, force: true }); });
test('publishes verified bytes atomically and reuses the finished cache', async () => {
 const fetcher = vi.fn().mockResolvedValueOnce(search()).mockResolvedValueOnce(new Response('valid fixture bytes')); vi.stubGlobal('fetch', fetcher);
 const path = await fetchSticker('ceramics'); expect(path).toBeTruthy();
 expect(await readFile(path!, 'utf8')).toBe('valid fixture bytes'); expect(await readdir(dir)).toEqual([`v2-${stickerCacheKey('ceramics')}.gif`]);
 expect(await fetchSticker('ceramics')).toBe(path); expect(fetcher).toHaveBeenCalledTimes(2);
});
test('rejects actual excess bytes despite misleading content length and removes partial output', async () => {
 let pulled = 0; const cancel = vi.fn(); const chunk = new Uint8Array(64 * 1024);
 const body = new ReadableStream({ pull(controller) { pulled += chunk.length; if (pulled > 32 * 1024 * 1024) controller.close(); else controller.enqueue(chunk); }, cancel });
 vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(search()).mockResolvedValueOnce(new Response(body, { headers: { 'content-length': '1' } })));
 expect(await fetchSticker('large')).toBeNull(); expect(await readdir(dir)).toEqual([]); expect(ffprobe).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalled();
 expect(pulled).toBeGreaterThan(MAX_STICKER_BYTES); expect(pulled).toBeLessThanOrEqual(MAX_STICKER_BYTES + 4 * chunk.length);
});
test('invalid video metadata is not published', async () => {
 vi.mocked(ffprobe).mockResolvedValue({ hasVideo: false, hasAudio: true, width: 0, height: 0, durationSec: 10, videoCodec: 'gif' });
 vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(search()).mockResolvedValueOnce(new Response('audio only')));
 expect(await fetchSticker('bad')).toBeNull(); expect(await readdir(dir)).toEqual([]);
});
test('cancellation during provider search propagates without a fallback request', async () => {
 const controller = new AbortController();
 const fetcher = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))); vi.stubGlobal('fetch', fetcher);
 const pending = fetchSticker('cancel', controller.signal);
 const result = expect(pending).rejects.toThrow('job cancelled');
 await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce()); controller.abort(Error('job cancelled')); await result;
 expect(fetcher).toHaveBeenCalledOnce(); expect(await readdir(dir)).toEqual([]);
});
test('cancellation during streaming removes the unfinished download', async () => {
 const controller = new AbortController(), cancel = vi.fn();
 const body = new ReadableStream({ start(stream) { stream.enqueue(new Uint8Array([1, 2])); }, cancel });
 vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(search()).mockResolvedValueOnce(new Response(body)));
 const pending = fetchSticker('cancel-stream', controller.signal), result = expect(pending).rejects.toThrow('job cancelled');
 await vi.waitFor(async () => expect((await readdir(dir)).some(file => file.endsWith('.part'))).toBe(true));
 controller.abort(Error('job cancelled')); await result;
 expect(await readdir(dir)).toEqual([]); expect(cancel).toHaveBeenCalled();
});
test('concurrent same-key downloads do not expose partial cache files', async () => {
 let finishFirst!: () => void;
 const first = new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('first')); finishFirst = () => stream.close(); } });
 let downloads = 0;
 vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('/stickers/search') ? search() : new Response(downloads++ === 0 ? first : 'second')));
 const pending = fetchSticker('same');
 await vi.waitFor(async () => expect((await readdir(dir)).some(file => file.endsWith('.part'))).toBe(true));
 expect((await readdir(dir)).some(file => file.endsWith('.gif'))).toBe(false);
 const secondPath = await fetchSticker('same'); expect(await readFile(secondPath!, 'utf8')).toBe('second');
 finishFirst(); const firstPath = await pending; expect(firstPath).toBe(secondPath); expect(await readFile(firstPath!, 'utf8')).toBe('first');
 expect((await readdir(dir)).filter(file => file.endsWith('.part'))).toEqual([]);
});
test('legacy cache and pre-aborted requests do not bypass validation or cancellation', async () => {
 await writeFile(join(dir, `${stickerCacheKey('old')}.gif`), 'old partial');
 const fetcher = vi.fn().mockResolvedValueOnce(search()).mockResolvedValueOnce(new Response('new bytes')); vi.stubGlobal('fetch', fetcher);
 const path = await fetchSticker('old'); expect(await readFile(path!, 'utf8')).toBe('new bytes');
 const controller = new AbortController(); controller.abort(Error('stopped'));
 await expect(fetchSticker('old', controller.signal)).rejects.toThrow('stopped'); expect(fetcher).toHaveBeenCalledTimes(2);
});

test('an exclusive temporary-file collision preserves the pre-existing file', async () => {
 const id = '11111111-1111-4111-8111-111111111111'; vi.mocked(randomUUID).mockReturnValueOnce(id);
 await writeFile(join(dir, `${id}.part`), 'existing file');
 vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(search()).mockResolvedValueOnce(new Response('new bytes')));
 expect(await fetchSticker('collision')).toBeNull();
 expect(await readFile(join(dir, `${id}.part`), 'utf8')).toBe('existing file');
});

test('non-GIF media is rejected even when returned from a GIF URL', async () => {
 vi.mocked(ffprobe).mockResolvedValue({ hasVideo: true, hasAudio: false, width: 720, height: 1280, durationSec: 10, videoCodec: 'h264' });
 vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(search()).mockResolvedValueOnce(new Response('mp4 bytes')));
 expect(await fetchSticker('wrong format')).toBeNull(); expect(await readdir(dir)).toEqual([]);
});
