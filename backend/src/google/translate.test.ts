import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const getAccessToken = vi.hoisted(() => vi.fn(async () => 'fixture-token' as string | null));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = getAccessToken; } }));
const { translateCues } = await import('./translate.js');

beforeEach(() => { vi.stubEnv('TRANSLATE_PROJECT', 'takeone-test'); vi.stubEnv('GEMINI_PROJECT', ''); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const translator = () => vi.fn(async (_url: string, init: RequestInit) => {
  const { contents } = JSON.parse(init.body as string) as { contents: string[] };
  return Response.json({ translations: contents.map((text) => ({ translatedText: `es:${text}`, detectedLanguageCode: 'en' })) });
});
const sentContents = (fetcher: ReturnType<typeof translator>) =>
  fetcher.mock.calls.map(([, init]) => (JSON.parse(init.body as string) as { contents: string[] }).contents);
const hang = () => vi.fn((_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))));
const cues = [{ start: 0, end: 1.5, text: 'Hello' }, { start: 1.5, end: 3.25, text: 'World' }];

it('posts plain-text contents and returns new cues with the same timing', async () => {
  const fetcher = translator(); vi.stubGlobal('fetch', fetcher);
  const input = structuredClone(cues);
  const result = await translateCues(input, 'es');
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://translate.googleapis.com/v3/projects/takeone-test:translateText');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body as string)).toEqual({ contents: ['Hello', 'World'], mimeType: 'text/plain', targetLanguageCode: 'es' });
  expect(result).toEqual([{ start: 0, end: 1.5, text: 'es:Hello' }, { start: 1.5, end: 3.25, text: 'es:World' }]);
  expect(input).toEqual(cues);
  expect(result[0]).not.toBe(input[0]);
});

it('falls back to GEMINI_PROJECT', async () => {
  vi.stubEnv('TRANSLATE_PROJECT', ''); vi.stubEnv('GEMINI_PROJECT', 'gemini-fallback');
  const fetcher = translator(); vi.stubGlobal('fetch', fetcher);
  await translateCues(cues, 'pt-BR');
  expect(fetcher.mock.calls[0][0]).toBe('https://translate.googleapis.com/v3/projects/gemini-fallback:translateText');
});

it('splits 1500 cues into 1024 and 476 sequential requests and keeps timing', async () => {
  const fetcher = translator(); vi.stubGlobal('fetch', fetcher);
  const many = Array.from({ length: 1500 }, (_, i) => ({ start: i, end: i + 0.75, text: String(i) }));
  const result = await translateCues(many, 'es');
  expect(sentContents(fetcher).map((contents) => contents.length)).toEqual([1024, 476]);
  expect(result).toEqual(many.map((cue) => ({ ...cue, text: `es:${cue.text}` })));
});

it('caps a request at 5000 code points and sends an oversized cue alone', async () => {
  const fetcher = translator(); vi.stubGlobal('fetch', fetcher);
  // 2000 emoji are 2000 code points but 4000 UTF-16 units, so two fit one request only when counting code points.
  const emoji = '\u{1F600}'.repeat(2000);
  const texts = [emoji, emoji, 'c'.repeat(6000), 'd', 'e'];
  await translateCues(texts.map((text, i) => ({ start: i, end: i + 1, text })), 'es');
  expect(sentContents(fetcher)).toEqual([[emoji, emoji], ['c'.repeat(6000)], ['d', 'e']]);
});

it('rejects a non-2xx response with its status', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })));
  await expect(translateCues(cues, 'es')).rejects.toThrow('Cloud Translation rejected the request (400)');
});

it.each([
  ['missing translations', {}, 'Cloud Translation returned a different number of cues'],
  ['a count mismatch', { translations: [{ translatedText: 'Hola' }] }, 'Cloud Translation returned a different number of cues'],
  ['a blank translatedText', { translations: [{ translatedText: 'Hola' }, { translatedText: '  ' }] }, 'Cloud Translation returned an empty cue'],
  ['a non-string translatedText', { translations: [{ translatedText: 'Hola' }, { translatedText: 7 }] }, 'Cloud Translation returned an empty cue'],
])('rejects %s', async (_name, body, message) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
  await expect(translateCues(cues, 'es')).rejects.toThrow(message);
});

it('rejects a pre-aborted signal with its reason and never calls fetch', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController(); controller.abort(Error('cancelled'));
  await expect(translateCues(cues, 'es', controller.signal)).rejects.toThrow('cancelled');
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects with the caller reason when aborted mid-request', async () => {
  const fetcher = hang(); vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const pending = translateCues(cues, 'es', controller.signal);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  controller.abort(Error('lease lost'));
  await expect(pending).rejects.toThrow('lease lost');
});

it('fails closed on missing or invalid config before any request, even for an empty list', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('TRANSLATE_PROJECT', '');
  await expect(translateCues([], 'es')).rejects.toThrow('TRANSLATE_PROJECT (or GEMINI_PROJECT) is required');
  vi.stubEnv('TRANSLATE_PROJECT', 'Bad/Project');
  await expect(translateCues(cues, 'es')).rejects.toThrow('Invalid Cloud Translation configuration');
  vi.stubEnv('TRANSLATE_PROJECT', 'takeone-test');
  await expect(translateCues(cues, 'es/../../v2')).rejects.toThrow('Invalid translation target language');
  expect(await translateCues([], 'es')).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
