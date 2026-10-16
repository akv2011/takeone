import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const token = vi.hoisted(() => vi.fn(async () => 'test-token'));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = token; } }));
import { generateGrounded, generateJson, geminiConfigured, parseTimestamp } from './gemini.js';

const answer = (text: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', ...extra }] }));
const parse = (value: unknown) => {
  if (typeof (value as { n?: unknown })?.n !== 'number') throw Error('caller rejected shape');
  return value as { n: number };
};
const schema = { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] };
const request = (overrides = {}) => ({ parts: [{ text: 'count' }], schema, timeoutMs: 5_000, parse, ...overrides });

beforeEach(() => { vi.stubEnv('GEMINI_PROJECT', 'test-project'); vi.stubEnv('GEMINI_MODEL', 'gemini-test'); vi.stubEnv('GEMINI_LOCATION', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

test('sends a schema-constrained request to the global endpoint and returns the parsed value', async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => answer('{"n":3}')); vi.stubGlobal('fetch', fetcher);
  const video = { fileData: { mimeType: 'video/mp4' as const, fileUri: 'gs://bucket/videos/u/j.mp4' as const } };
  expect(await generateJson(request({ parts: [video, { text: 'count' }], system: 'Be brief.' }))).toEqual({ n: 3 });
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/gemini-test:generateContent');
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-token');
  expect(JSON.parse(init.body as string)).toEqual({
    contents: [{ role: 'user', parts: [video, { text: 'count' }] }],
    systemInstruction: { parts: [{ text: 'Be brief.' }] },
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
  });
});
test('a regional location uses the regional host', async () => {
  vi.stubEnv('GEMINI_LOCATION', 'us-central1');
  const fetcher = vi.fn(async () => answer('{"n":1}')); vi.stubGlobal('fetch', fetcher);
  await generateJson(request());
  expect(fetcher.mock.calls[0]).toContain('https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-test:generateContent');
});
test.each([
  ['GEMINI_MODEL', 'GEMINI_MODEL is required'],
  ['GEMINI_PROJECT', 'GEMINI_PROJECT is required'],
])('missing %s fails closed before credentials or network', async (name, message) => {
  vi.stubEnv(name, '');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  expect(geminiConfigured()).toBe(false);
  await expect(generateJson(request())).rejects.toThrow(message);
  expect(token).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
test.each([['GEMINI_MODEL', 'gpt-5'], ['GEMINI_LOCATION', 'https://evil.test'], ['GEMINI_PROJECT', 'Bad/Project']])('rejects invalid %s', async (name, value) => {
  vi.stubEnv(name, value); vi.stubGlobal('fetch', vi.fn());
  await expect(generateJson(request())).rejects.toThrow('Invalid Gemini configuration');
});
test('caller validation rejects schema-invalid JSON', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => answer('{"n":"three"}')));
  await expect(generateJson(request())).rejects.toThrow('caller rejected shape');
});
test('non-JSON model text is rejected', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => answer('Here you go: 3')));
  await expect(generateJson(request())).rejects.toThrow('invalid JSON');
});
test('non-200 responses are rejected without echoing the provider body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('quota detail with project secrets', { status: 429 })));
  const error = await generateJson(request()).catch((e: Error) => e);
  expect(error.message).toBe('Gemini rejected the request (429)');
});
test('safety blocks and empty candidates are rejected', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => answer('', { finishReason: 'SAFETY' })));
  await expect(generateJson(request())).rejects.toThrow('SAFETY');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }))));
  await expect(generateJson(request())).rejects.toThrow('blocked the prompt (PROHIBITED_CONTENT)');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [] }))));
  await expect(generateJson(request())).rejects.toThrow('no candidates');
  vi.stubGlobal('fetch', vi.fn(async () => answer('   ')));
  await expect(generateJson(request())).rejects.toThrow('empty answer');
});
test('thought parts are excluded from the answer', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking', thought: true }, { text: '{"n":7}' }] } }] }))));
  expect(await generateJson(request())).toEqual({ n: 7 });
});
test('oversized responses are rejected', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(1024 * 1024 + 1))));
  await expect(generateJson(request())).rejects.toThrow('size limit');
});
test('the caller signal aborts an in-flight request with the caller reason', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(Error('transport cancelled')))));
  vi.stubGlobal('fetch', fetcher);
  const pending = generateJson(request({ signal: controller.signal }));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  controller.abort(Error('lease lost'));
  await expect(pending).rejects.toThrow('lease lost');
});
test('a slow provider times out', async () => {
  vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))));
  await expect(generateJson(request({ timeoutMs: 20 }))).rejects.toThrow('Gemini request timed out');
});

test('a requested thinking level reaches generationConfig for JSON and grounded calls', async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => answer('{"n":3}')); vi.stubGlobal('fetch', fetcher);
  await generateJson(request({ parts: [{ text: 'count' }], thinking: 'LOW' }));
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string).generationConfig).toEqual({ responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: { thinkingLevel: 'LOW' } });
  await generateGrounded({ prompt: 'check', timeoutMs: 1000, thinking: 'LOW' });
  const grounded = JSON.parse(fetcher.mock.calls[1][1].body as string);
  expect(grounded.tools).toEqual([{ googleSearch: {} }]);
  expect(grounded.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'LOW' } });
});

test.each<[string, number]>([
  ['0:12', 12], ['5:07', 307], ['05:07', 307], ['12:31.5', 751.5], ['75:30', 4530], ['1:02:03', 3723], [' 8:18 ', 498],
])('timestamp %j is %d seconds', (value, seconds) => {
  expect(parseTimestamp(value)).toBe(seconds);
});

// A bare number is the ambiguous answer this format exists to avoid: Gemini wrote 5:07 as 507.
test.each<[string, unknown]>([
  ['a number', 507], ['a numeric string', '507'], ['one seconds digit', '5:7'], ['60 seconds', '1:60'],
  ['60 minutes under an hour', '1:60:00'], ['empty', ''], ['words', 'about five minutes'], ['a negative', '-0:05'], ['null', null],
])('timestamp rejects %s', (_label, value) => {
  expect(parseTimestamp(value)).toBeUndefined();
});
