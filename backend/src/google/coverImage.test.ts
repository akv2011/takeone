import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const getAccessToken = vi.hoisted(() => vi.fn(async () => 'fixture-token' as string | null));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = getAccessToken; } }));
const { generateCoverImage } = await import('./coverImage.js');

// Signature plus an IHDR chunk; CRC bytes stay zero because the module does not check them.
function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr]);
}
const pngPart = (bytes: Buffer) => ({ inlineData: { mimeType: 'image/png', data: bytes.toString('base64') } });
const reply = (parts: unknown[]) => Response.json({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] });
const hang = () => vi.fn((_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))));
const prompt = 'A neon city street at night, vertical poster';
let dir: string, out: string;

beforeEach(async () => {
  vi.stubEnv('IMAGE_MODEL', 'gemini-2.5-flash-image');
  vi.stubEnv('IMAGE_PROJECT', 'takeone-test');
  vi.stubEnv('GEMINI_PROJECT', '');
  vi.stubEnv('IMAGE_LOCATION', '');
  dir = await mkdtemp(join(tmpdir(), 'cover-test-'));
  out = join(dir, 'cover.png');
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

it('posts a 9:16 image request to the global endpoint and writes the decoded PNG', async () => {
  const image = png(768, 1344);
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => reply([{ text: 'Here is your cover.' }, pngPart(image)]));
  vi.stubGlobal('fetch', fetcher);
  await generateCoverImage(`  ${prompt}  `, out);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://aiplatform.googleapis.com/v1/projects/takeone-test/locations/global/publishers/google/models/gemini-2.5-flash-image:generateContent');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body as string)).toEqual({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '9:16', imageOutputOptions: { mimeType: 'image/png' } }, candidateCount: 1 },
  });
  expect(await readFile(out)).toEqual(image);
});

it('uses a regional host and the GEMINI_PROJECT fallback', async () => {
  vi.stubEnv('IMAGE_PROJECT', ''); vi.stubEnv('GEMINI_PROJECT', 'gemini-fallback'); vi.stubEnv('IMAGE_LOCATION', 'us-central1');
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => reply([pngPart(png(1080, 1920))]));
  vi.stubGlobal('fetch', fetcher);
  await generateCoverImage(prompt, out);
  expect(fetcher.mock.calls[0][0]).toBe('https://us-central1-aiplatform.googleapis.com/v1/projects/gemini-fallback/locations/us-central1/publishers/google/models/gemini-2.5-flash-image:generateContent');
});

it('rejects a non-2xx response with its status', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })));
  await expect(generateCoverImage(prompt, out)).rejects.toThrow('Gemini image rejected the request (403)');
});

it.each([
  ['a blocked prompt', Response.json({ promptFeedback: { blockReason: 'SAFETY' } }), 'Gemini image blocked the prompt (SAFETY)'],
  ['a text-only answer', reply([{ text: 'I cannot draw that.' }]), 'Gemini image returned no PNG'],
  ['a JPEG part', reply([{ inlineData: { mimeType: 'image/jpeg', data: png(768, 1344).toString('base64') } }]), 'Gemini image returned no PNG'],
  ['non-base64 PNG data', reply([{ inlineData: { mimeType: 'image/png', data: 'not base64!' } }]), 'Gemini image returned no PNG'],
  ['a wrong signature', reply([pngPart(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), png(768, 1344).subarray(4)]))]), 'Gemini image returned no PNG'],
  ['a truncated PNG', reply([pngPart(png(768, 1344).subarray(0, 20))]), 'Gemini image returned no PNG'],
  ['a square image', reply([pngPart(png(1024, 1024))]), 'Gemini image did not return a 9:16 image'],
  ['a 16:9 image', reply([pngPart(png(1344, 768))]), 'Gemini image did not return a 9:16 image'],
  ['a zero-size image', reply([pngPart(png(0, 0))]), 'Gemini image did not return a 9:16 image'],
])('rejects %s and writes nothing', async (_name, response, message) => {
  vi.stubGlobal('fetch', vi.fn(async () => response));
  await expect(generateCoverImage(prompt, out)).rejects.toThrow(message);
  await expect(access(out)).rejects.toThrow();
});

it('rejects a pre-aborted signal with its reason and never calls fetch', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController(); controller.abort(Error('cancelled'));
  await expect(generateCoverImage(prompt, out, controller.signal)).rejects.toThrow('cancelled');
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects with the caller reason when aborted mid-request', async () => {
  const fetcher = hang(); vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const pending = generateCoverImage(prompt, out, controller.signal);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  controller.abort(Error('lease lost'));
  await expect(pending).rejects.toThrow('lease lost');
  await expect(access(out)).rejects.toThrow();
});

it.each([
  ['no IMAGE_MODEL', { IMAGE_MODEL: '' }, 'IMAGE_MODEL is required'],
  ['no project', { IMAGE_PROJECT: '', GEMINI_PROJECT: '' }, 'IMAGE_PROJECT (or GEMINI_PROJECT) is required'],
  ['a non-gemini model', { IMAGE_MODEL: 'imagen-4.0-generate-001' }, 'Invalid image generation configuration'],
  ['a model with a path', { IMAGE_MODEL: 'gemini-x/../../other' }, 'Invalid image generation configuration'],
  ['an invalid project', { IMAGE_PROJECT: 'Bad_Project' }, 'Invalid image generation configuration'],
  ['a host-injecting location', { IMAGE_LOCATION: 'x.evil.com' }, 'Invalid image generation configuration'],
])('fails closed on %s without calling fetch', async (_name, env, message) => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(generateCoverImage(prompt, out)).rejects.toThrow(message);
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([['a 5-character prompt', 'short'], ['a blank prompt', '      '], ['a 4001-character prompt', 'x'.repeat(4001)]])('rejects %s without calling fetch', async (_name, text) => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(generateCoverImage(text, out)).rejects.toThrow('Invalid cover image prompt');
  expect(fetcher).not.toHaveBeenCalled();
});
