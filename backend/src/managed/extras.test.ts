import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Writable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Bucket } from '@google-cloud/storage';
const token = vi.hoisted(() => vi.fn(async () => 'test-token'));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = token; } }));
import { renderExtras } from './extras.js';
import { runWorker, type ClaimedJob, type WorkerDeps } from './worker.js';

const job: ClaimedJob = { jobId: 'job-1', leaseToken: 'lease-1', userId: 'owner', mode: 'generate', prompt: 'Why the Eiffel Tower grows in summer https://youtu.be/abc', aspect: '9:16', isPro: false };
const answer = (text: string) => Response.json({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });
function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); ihdr.write('IHDR', 4, 'latin1'); ihdr.writeUInt32BE(width, 8); ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]);
}
const imageReply = () => Response.json({ candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: 'image/png', data: png(768, 1344).toString('base64') } }] }, finishReason: 'STOP' }] });
const isImage = (url: string) => url.includes('/models/gemini-image-test:');
const hang = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)));
let work: string, log: ReturnType<typeof vi.fn>;
function storage() {
  const writes: { key: string; contentType: string; precondition: unknown; bytes: number }[] = [];
  const bucket = { file: (key: string) => ({ createWriteStream: (options: any) => {
    let bytes = 0;
    return new Writable({ write(chunk, _encoding, cb) { bytes += chunk.length; cb(); }, final(cb) {
      writes.push({ key, contentType: options.metadata.contentType, precondition: options.preconditionOpts, bytes }); cb();
    } });
  } }) } as unknown as Pick<Bucket, 'file'>;
  return { bucket, writes };
}
const deps = (bucket = storage().bucket) => ({ bucket, work, log });
const live = () => new AbortController().signal;

beforeEach(async () => {
  vi.stubEnv('GEMINI_PROJECT', 'test-project'); vi.stubEnv('GEMINI_MODEL', 'gemini-test'); vi.stubEnv('GEMINI_LOCATION', '');
  vi.stubEnv('IMAGE_MODEL', ''); vi.stubEnv('IMAGE_PROJECT', ''); vi.stubEnv('IMAGE_LOCATION', '');
  work = await mkdtemp(join(tmpdir(), 'extras-test-')); log = vi.fn();
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); await rm(work, { recursive: true, force: true }); });

const worker = (overrides: Partial<WorkerDeps>) => ({
  claim: async () => job, heartbeat: async () => true,
  render: async () => '/mock/output.mp4',
  inspect: async () => ({ mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true }),
  upload: async () => {}, complete: async () => true,
  fail: async () => { throw Error('fail must not be called'); },
  cleanup: async () => {}, deliver: async () => {}, log: () => {}, ...overrides,
}) satisfies WorkerDeps;

test('a failing provider records claims as unavailable and the job still completes', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('backend error', { status: 500 })));
  const completed: unknown[] = [], events: string[] = [];
  const outcome = await runWorker(job.jobId, worker({
    extras: (claimed, signal) => renderExtras(claimed, { captions: 'The Eiffel Tower is 330 metres tall.' }, deps(), signal),
    complete: async (_claimed, storageKey, _metadata, extras) => { completed.push({ storageKey, ...extras }); return true; },
    log: event => events.push(event),
  }));
  expect(outcome).toBe('completed');
  expect(completed).toEqual([{ storageKey: 'videos/job-1/lease-1.mp4', claims: { status: 'unavailable' } }]);
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'takeone.claims_unavailable', reason: 'Gemini rejected the request (500)' }));
  expect(events.map(event => JSON.parse(event).stage).filter(Boolean)).toEqual(['claim', 'render', 'inspect', 'upload', 'extras', 'finalize', 'post_completion_hook', 'cleanup']);
});

test('a rejecting extras step still completes the job without extras', async () => {
  const complete = vi.fn(async () => true);
  expect(await runWorker(job.jobId, worker({ extras: async () => { throw Error('bug'); }, complete }))).toBe('completed');
  expect(complete).toHaveBeenCalledWith(job, 'videos/job-1/lease-1.mp4', expect.any(Object), undefined);
});

test('a lease lost during extras aborts them and leaves the decision to the fenced completion', async () => {
  let alive = true, aborted = false;
  const complete = vi.fn(async (_job: ClaimedJob, _key: string, _metadata: unknown, _extras?: unknown) => alive);
  const outcome = await runWorker(job.jobId, worker({
    heartbeat: async () => alive,
    extras: (_job, signal) => new Promise(resolve => { alive = false; signal.addEventListener('abort', () => { aborted = true; resolve({ claims: { status: 'unavailable' } }); }); }),
    complete,
  }), 5);
  expect(aborted).toBe(true);
  expect(complete).toHaveBeenCalledWith(job, 'videos/job-1/lease-1.mp4', expect.any(Object), { claims: { status: 'unavailable' } });
  expect(outcome).toBe('lost');
});

test('a hung provider resolves at the deadline with claims unavailable and no cover', async () => {
  vi.stubEnv('IMAGE_MODEL', 'gemini-image-test'); vi.stubEnv('IMAGE_PROJECT', 'image-project');
  vi.stubGlobal('fetch', vi.fn(hang));
  const { bucket, writes } = storage();
  const started = Date.now();
  expect(await renderExtras(job, { captions: 'The Eiffel Tower is 330 metres tall.' }, deps(bucket), live(), 100)).toEqual({ claims: { status: 'unavailable' } });
  expect(Date.now() - started).toBeLessThan(2_000);
  expect(writes).toEqual([]);
});

test('IMAGE_MODEL makes one create-only 9:16 cover next to the video from the hook', async () => {
  vi.stubEnv('IMAGE_MODEL', 'gemini-image-test'); vi.stubEnv('IMAGE_PROJECT', 'image-project');
  const fetcher = vi.fn(async (url: string, _init: RequestInit) => isImage(url) ? imageReply() : answer('{"claims":[]}'));
  vi.stubGlobal('fetch', fetcher);
  const { bucket, writes } = storage();
  expect(await renderExtras(job, { captions: 'I love summer.', hook: 'The tower that grows' }, deps(bucket), live())).toEqual({
    claims: { status: 'checked', claims: [] }, coverStorageKey: 'videos/job-1/lease-1-cover.png',
  });
  expect(writes).toEqual([{ key: 'videos/job-1/lease-1-cover.png', contentType: 'image/png', precondition: { ifGenerationMatch: 0 }, bytes: 33 }]);
  const imageCalls = fetcher.mock.calls.filter(([url]) => isImage(url));
  expect(imageCalls).toHaveLength(1);
  const prompt = JSON.parse(imageCalls[0][1].body as string).contents[0].parts[0].text as string;
  expect(prompt).toContain('about: The tower that grows.');
});

test('a new video without a hook takes its cover subject from the prompt, minus links', async () => {
  vi.stubEnv('IMAGE_MODEL', 'gemini-image-test'); vi.stubEnv('IMAGE_PROJECT', 'image-project');
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => imageReply()); vi.stubGlobal('fetch', fetcher);
  expect(await renderExtras(job, {}, deps(), live())).toEqual({ coverStorageKey: 'videos/job-1/lease-1-cover.png' });
  const prompt = JSON.parse(fetcher.mock.calls[0][1].body as string).contents[0].parts[0].text as string;
  expect(prompt).toContain('about: Why the Eiffel Tower grows in summer.');
  expect(prompt).not.toContain('youtu.be');
});

test('a cover failure keeps the claims result', async () => {
  vi.stubEnv('IMAGE_MODEL', 'gemini-image-test'); vi.stubEnv('IMAGE_PROJECT', 'image-project');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => isImage(url) ? new Response('denied', { status: 403 }) : answer('{"claims":[]}')));
  expect(await renderExtras(job, { captions: 'I love summer.' }, deps(), live())).toEqual({ claims: { status: 'checked', claims: [] } });
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'takeone.cover_unavailable', reason: 'Gemini image rejected the request (403)' }));
});

test('unset IMAGE_MODEL, no caption text, or an edit without a hook calls nothing', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  expect(await renderExtras(job, { captions: '   ' }, deps(), live())).toEqual({});
  vi.stubEnv('IMAGE_MODEL', 'gemini-image-test'); vi.stubEnv('IMAGE_PROJECT', 'image-project');
  expect(await renderExtras({ ...job, mode: 'edit', prompt: 'Make it square' }, {}, deps(), live())).toEqual({});
  expect(fetcher).not.toHaveBeenCalled();
});
