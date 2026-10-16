import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const getAccessToken = vi.hoisted(() => vi.fn(async () => 'fixture-token'));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = getAccessToken; } }));
const ff = vi.hoisted(() => vi.fn(async (args: string[], _signal?: AbortSignal) => {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(args.at(-1)!, 'flac-fixture');
}));
vi.mock('../media/ffmpeg.js', () => ({ ff }));
const sleep = vi.hoisted(() => vi.fn(async (_ms: number, _value?: unknown, _options?: { signal?: AbortSignal }) => {}));
vi.mock('node:timers/promises', () => ({ setTimeout: sleep }));
const { recognizeSpeech } = await import('./speech.js');

const UPLOAD = 'POST https://storage.googleapis.com/upload/storage/v1/b/fixture-bucket/o?uploadType=media&name=speech%2FOBJECT.flac';
const BATCH = 'POST https://us-speech.googleapis.com/v2/projects/fixture-project/locations/us/recognizers/_:batchRecognize';
const OPERATION = 'projects/123456/locations/us/operations/op-1_A';
const POLL = `GET https://us-speech.googleapis.com/v2/${OPERATION}`;
const DELETE = 'DELETE https://storage.googleapis.com/storage/v1/b/fixture-bucket/o/speech%2FOBJECT.flac';
const transcript = { results: [{ alternatives: [{ transcript: 'hi', words: [{ word: 'hi', startOffset: '0s', endOffset: '0.5s' }] }], resultEndOffset: '1s' }] };

type Route = (init: RequestInit) => Response | Promise<Response>;
let routes: Record<string, Route>;
let seen: string[];
let uri: string;
const fetcher = vi.fn(async (url: string, init: RequestInit) => {
  const key = `${init.method} ${url.replace(/speech%2F[0-9a-f-]{36}\.flac/, 'speech%2FOBJECT.flac')}`;
  seen.push(key);
  if (!routes[key]) throw Error(`unrouted ${key}`);
  return routes[key](init);
});
const request = (key: string) => fetcher.mock.calls[seen.indexOf(key)];
const done = (results: (uri: string) => unknown, extra = {}) => () => Response.json({ name: OPERATION, done: true, response: { results: results(uri) }, ...extra });
const tempDirGone = () => existsSync(dirname(ff.mock.calls[0][0].at(-1)!)) === false;
const hang: Route = init => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)));

beforeEach(() => {
  vi.stubEnv('SPEECH_PROJECT', 'fixture-project'); vi.stubEnv('GEMINI_PROJECT', '');
  vi.stubEnv('SPEECH_LOCATION', 'us'); vi.stubEnv('SPEECH_MODEL', 'chirp_3'); vi.stubEnv('GCS_BUCKET', 'fixture-bucket');
  vi.stubGlobal('fetch', fetcher);
  ff.mockClear(); fetcher.mockClear(); sleep.mockClear();
  seen = []; uri = '';
  routes = {
    [UPLOAD]: () => Response.json({ name: 'uploaded' }),
    [BATCH]: init => { uri = JSON.parse(String(init.body)).files[0].uri; return Response.json({ name: OPERATION }); },
    [POLL]: done(uri => ({ [uri]: { inlineResult: { transcript } } })),
    [DELETE]: () => new Response(null, { status: 204 }),
  };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('uploads mono FLAC, runs chirp batch recognition, polls the operation, and deletes the object', async () => {
  expect(await recognizeSpeech('/input.mp4')).toEqual(transcript);
  expect(seen).toEqual([UPLOAD, BATCH, POLL, DELETE]);
  expect(ff.mock.calls[0][0].slice(0, -1)).toEqual(['-i', '/input.mp4', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac']);
  expect(tempDirGone()).toBe(true);
  const [uploadUrl, upload] = request(UPLOAD);
  expect(upload.headers).toMatchObject({ authorization: 'Bearer fixture-token', 'content-type': 'audio/flac' });
  expect(Buffer.from(upload.body as Uint8Array).toString()).toBe('flac-fixture');
  const object = /name=speech%2F([0-9a-f-]{36})\.flac$/.exec(uploadUrl)![1];
  expect(JSON.parse(String(request(BATCH)[1].body))).toEqual({
    config: { autoDecodingConfig: {}, languageCodes: ['auto'], model: 'chirp_3', features: { enableWordTimeOffsets: true, enableAutomaticPunctuation: true } },
    files: [{ uri: `gs://fixture-bucket/speech/${object}.flac` }],
    recognitionOutputConfig: { inlineResponseConfig: {} },
  });
  expect(request(DELETE)[0]).toBe(`https://storage.googleapis.com/storage/v1/b/fixture-bucket/o/speech%2F${object}.flac`);
  expect(sleep).not.toHaveBeenCalled();
});

it('waits between polls until the operation is done, with the caller signal', async () => {
  let polls = 0;
  const finished = routes[POLL];
  routes[POLL] = init => (++polls < 3 ? Response.json({ name: OPERATION }) : finished(init));
  const controller = new AbortController();
  expect(await recognizeSpeech('/input.mp4', controller.signal)).toEqual(transcript);
  expect(seen).toEqual([UPLOAD, BATCH, POLL, POLL, POLL, DELETE]);
  expect(sleep.mock.calls).toEqual([[2000, undefined, { signal: controller.signal }], [2000, undefined, { signal: controller.signal }]]);
});

it('gives up after 150 polls and still deletes the object', async () => {
  routes[POLL] = () => Response.json({ name: OPERATION, done: false });
  await expect(recognizeSpeech('/input.mp4')).rejects.toThrow('Speech-to-Text is still processing');
  expect(seen.filter(key => key === POLL)).toHaveLength(150);
  expect(sleep).toHaveBeenCalledTimes(149);
  expect(seen.at(-1)).toBe(DELETE);
});

it.each([
  ['SPEECH_LOCATION', 'SPEECH_LOCATION is required'],
  ['SPEECH_MODEL', 'SPEECH_MODEL is required'],
  ['GCS_BUCKET', 'GCS_BUCKET is required'],
  ['SPEECH_PROJECT', 'SPEECH_PROJECT (or GEMINI_PROJECT) is required'],
])('fails closed without %s before any ffmpeg or network work', async (name, message) => {
  vi.stubEnv(name, '');
  await expect(recognizeSpeech('/input.mp4')).rejects.toThrow(message);
  expect(ff).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it('falls back to GEMINI_PROJECT for the project', async () => {
  vi.stubEnv('SPEECH_PROJECT', ''); vi.stubEnv('GEMINI_PROJECT', 'fixture-project');
  expect(await recognizeSpeech('/input.mp4')).toEqual(transcript);
  expect(seen).toContain(BATCH);
});

it.each([
  ['SPEECH_LOCATION', 'us.evil.com'], ['SPEECH_LOCATION', 'us/x'], ['SPEECH_PROJECT', 'evil.com/x'],
  ['SPEECH_MODEL', 'chirp_3/../x'], ['GCS_BUCKET', 'bucket/../../x'],
])('rejects %s=%s as invalid configuration', async (name, value) => {
  vi.stubEnv(name, value);
  await expect(recognizeSpeech('/input.mp4')).rejects.toThrow('Invalid Speech-to-Text configuration');
  expect(ff).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it('uses the global endpoint for the global location', async () => {
  vi.stubEnv('SPEECH_LOCATION', 'global');
  routes = { [UPLOAD]: routes[UPLOAD], [DELETE]: routes[DELETE], [BATCH.replace('us-speech', 'speech').replace('/us/', '/global/')]: () => new Response('denied', { status: 403 }) };
  await expect(recognizeSpeech('/input.mp4')).rejects.toThrow('Speech-to-Text rejected the request (403)');
  expect(seen).toHaveLength(3);
});

it('reports a rejected batchRecognize by status and still deletes the object and temp dir', async () => {
  routes[BATCH] = () => new Response('denied with provider detail', { status: 403 });
  await expect(recognizeSpeech('/input.mp4')).rejects.toThrow(/^Speech-to-Text rejected the request \(403\)$/);
  expect(seen).toEqual([UPLOAD, BATCH, DELETE]);
  expect(tempDirGone()).toBe(true);
});

it.each([undefined, 7, 'projects/p/locations/eu/operations/x', '../../evil', 'projects/p/locations/us/operations/x?y=1', 'https://evil.com/projects/p/locations/us/operations/x'])(
  'rejects operation name %j without polling', async name => {
    routes[BATCH] = () => Response.json({ name });
    await expect(recognizeSpeech('/input.mp4')).rejects.toThrow('Speech-to-Text returned an invalid operation');
    expect(seen).toEqual([UPLOAD, BATCH, DELETE]);
  });

it.each([
  ['an operation error', done(() => ({}), { error: { code: 3, message: 'provider detail' } }), /^Speech-to-Text failed \(3\)$/],
  ['a missing file result', done(() => ({ 'gs://fixture-bucket/other.flac': { inlineResult: { transcript } } })), 'Speech-to-Text returned no result for the audio'],
  ['a file error', done(uri => ({ [uri]: { error: { code: 5, message: 'provider detail' } } })), /^Speech-to-Text failed for the audio \(5\)$/],
  ['a non-numeric file error code', done(uri => ({ [uri]: { error: { code: 'provider detail' } } })), /^Speech-to-Text failed for the audio \(unknown\)$/],
  ['a malformed transcript', done(uri => ({ [uri]: { inlineResult: { transcript: 'hi' } } })), 'Speech-to-Text returned a malformed result'],
  ['a missing response', () => Response.json({ name: OPERATION, done: true }), 'Speech-to-Text returned no result for the audio'],
] as const)('rejects %s and deletes the object', async (_case, route, message) => {
  routes[POLL] = route;
  await expect(recognizeSpeech('/input.mp4')).rejects.toThrow(message);
  expect(seen.at(-1)).toBe(DELETE);
});

it.each([{}, { code: 0 }])('treats an OK status %j on the operation and file as success', async status => {
  routes[POLL] = done(uri => ({ [uri]: { error: status, inlineResult: { transcript } } }), { error: status });
  expect(await recognizeSpeech('/input.mp4')).toEqual(transcript);
});

it('pre-aborted recognition never runs ffmpeg or touches the network', async () => {
  const controller = new AbortController(); controller.abort(Error('lease lost'));
  await expect(recognizeSpeech('/input.mp4', controller.signal)).rejects.toThrow('lease lost');
  expect(ff).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it('aborting an in-flight batchRecognize rejects with the caller reason and still deletes the object', async () => {
  routes[BATCH] = hang;
  const controller = new AbortController();
  const pending = recognizeSpeech('/input.mp4', controller.signal);
  await vi.waitFor(() => expect(seen).toContain(BATCH));
  controller.abort(Error('lease lost'));
  await expect(pending).rejects.toThrow('lease lost');
  expect(request(BATCH)[1].signal!.aborted).toBe(true);
  expect(seen).toEqual([UPLOAD, BATCH, DELETE]);
  expect(request(DELETE)[1].signal!.aborted).toBe(false);
  expect(tempDirGone()).toBe(true);
});

it('an abort during ffmpeg rejects with the caller reason and skips the delete', async () => {
  const controller = new AbortController();
  ff.mockImplementationOnce(async () => { controller.abort(Error('lease lost')); throw Error('Render aborted'); });
  await expect(recognizeSpeech('/input.mp4', controller.signal)).rejects.toThrow('lease lost');
  expect(fetcher).not.toHaveBeenCalled();
});
