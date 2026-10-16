import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const getAccessToken = vi.hoisted(() => vi.fn(async () => 'fixture-token' as string | null));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = getAccessToken; } }));
const { synthesizeSpeech } = await import('./tts.js');

const voice = { languageCode: 'en-US', voiceName: 'en-US-Chirp3-HD-Charon' };
const mp3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0xff, 0xfb, 0x90]);
let dir: string, out: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tts-test-')); out = join(dir, 'narration.mp3'); });
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

const hang = () => vi.fn((_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))));

it('posts the synthesize request and writes the decoded MP3', async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ audioContent: mp3.toString('base64') }));
  vi.stubGlobal('fetch', fetcher);
  await synthesizeSpeech({ text: '  Hello there.  ', ...voice }, out);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body as string)).toEqual({
    input: { text: 'Hello there.' },
    voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Charon' },
    audioConfig: { audioEncoding: 'MP3' },
  });
  expect(await readFile(out)).toEqual(mp3);
});

it('rejects a non-2xx response with its status', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('quota', { status: 429 })));
  await expect(synthesizeSpeech({ text: 'Hello', ...voice }, out)).rejects.toThrow('Text-to-Speech rejected the request (429)');
});

it.each([{}, { audioContent: '' }, { audioContent: 'not base64!' }, { audioContent: 42 }])('rejects malformed audio %j and writes nothing', async (body) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
  await expect(synthesizeSpeech({ text: 'Hello', ...voice }, out)).rejects.toThrow('Text-to-Speech returned no audio');
  await expect(access(out)).rejects.toThrow();
});

it('rejects a pre-aborted signal with its reason and never calls fetch', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController(); controller.abort(Error('cancelled'));
  await expect(synthesizeSpeech({ text: 'Hello', ...voice }, out, controller.signal)).rejects.toThrow('cancelled');
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects with the caller reason when aborted mid-request', async () => {
  const fetcher = hang(); vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const pending = synthesizeSpeech({ text: 'Hello', ...voice }, out, controller.signal);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  controller.abort(Error('lease lost'));
  await expect(pending).rejects.toThrow('lease lost');
  await expect(access(out)).rejects.toThrow();
});

it.each([
  ['blank text', { text: '   ', ...voice }, 'Narration text is empty'],
  ['1700 Devanagari characters (5100 bytes)', { text: 'क'.repeat(1700), languageCode: 'hi-IN', voiceName: 'hi-IN-Chirp3-HD-Charon' }, 'exceeds the Text-to-Speech request limit'],
  ['a voice name with a path', { text: 'Hello', languageCode: 'en-US', voiceName: 'en-US/../../v1beta1' }, 'Invalid Text-to-Speech voice'],
  ['a bad language code', { text: 'Hello', languageCode: 'english', voiceName: 'en-US-Chirp3-HD-Charon' }, 'Invalid Text-to-Speech voice'],
])('fails closed on %s without calling fetch', async (_name, request, message) => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(synthesizeSpeech(request, out)).rejects.toThrow(message);
  expect(fetcher).not.toHaveBeenCalled();
});
