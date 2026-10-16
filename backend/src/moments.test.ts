import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { async getAccessToken() { return 'test-token'; } } }));
import { spawn } from 'node:child_process';
import { pickMoments } from './moments.js';

const answer = (value: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }] }));
const moment = { start: '1:10', end: '1:35', hook: 'He actually said it', reframe: 'crop', broll: [{ at: '1:20', dur_sec: 3, keywords: ['city night'] }], zooms: [{ at: '1:30', dur_sec: 1 }] };
beforeEach(() => { vi.stubEnv('GEMINI_PROJECT', 'test-project'); vi.stubEnv('GEMINI_MODEL', 'gemini-test'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

test('a stored video goes to Gemini as a gs:// file without fetching captions', async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => answer({ moments: [moment] })); vi.stubGlobal('fetch', fetcher);
  const [picked] = await pickMoments({ gcsUri: 'gs://bucket/videos/u/j.mp4' }, 1);
  expect(spawn).not.toHaveBeenCalled();
  expect(picked).toEqual({ start: '1:10', end: '1:35', hook: 'He actually said it', reframe: 'crop', broll: [{ at: 10, dur: 3, keywords: ['city night'] }], zooms: [{ at: 20, dur: 1 }] });
  const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
  expect(body.contents[0].parts[0]).toEqual({ fileData: { mimeType: 'video/mp4', fileUri: 'gs://bucket/videos/u/j.mp4' } });
  expect(body.contents[0].parts[1].text).toContain('frames and audio');
  expect(body.generationConfig.responseSchema.required).toEqual(['moments']);
});
test('a YouTube link without captions still asks for a range and never calls Gemini', async () => {
  vi.mocked(spawn).mockImplementation(() => { const child = new EventEmitter() as any; queueMicrotask(() => child.emit('close', 1)); return child; });
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(pickMoments({ youtubeUrl: 'https://youtu.be/abc' }, 1)).rejects.toThrow('no captions on that video');
  expect(fetcher).not.toHaveBeenCalled();
});
test('unusable moments are rejected with a range prompt', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => answer({ moments: [{ ...moment, end: '1:00' }] })));
  await expect(pickMoments({ gcsUri: 'gs://bucket/videos/u/j.mp4' }, 1)).rejects.toThrow('could not find good moments');
});
// Production regression on an 88 s upload: asked for integer seconds, Gemini answered 48 to 113 for 0:48 to 1:13.
test('times are minutes and seconds, and a bare number is never read as seconds', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => answer({ moments: [{ ...moment, start: '0:48', end: '1:13', broll: [], zooms: [] }] })));
  expect((await pickMoments({ gcsUri: 'gs://bucket/videos/u/j.mp4' }, 1))[0]).toMatchObject({ start: '0:48', end: '1:13' });
  vi.stubGlobal('fetch', vi.fn(async () => answer({ moments: [{ ...moment, start: 48, end: 113 }] })));
  await expect(pickMoments({ gcsUri: 'gs://bucket/videos/u/j.mp4' }, 1)).rejects.toThrow('could not find good moments');
});
test('missing Gemini configuration fails before any subtitle download', async () => {
  vi.stubEnv('GEMINI_MODEL', '');
  await expect(pickMoments({ youtubeUrl: 'https://youtu.be/abc' }, 1)).rejects.toThrow('GEMINI_MODEL');
  expect(spawn).not.toHaveBeenCalled();
});
// The exact prompt for an unset language; a language only appends the hook line.
const MOMENTS_PROMPT = "Watch the whole video above, frames and audio together. Pick the 1 BEST 15-30 second segments for viral vertical shorts (punchlines, roasts, high-energy or surprising moments). Segments must not overlap.\nWrite every time as M:SS from the start of the video, or H:MM:SS past an hour. Durations stay whole seconds.\nFor each segment also produce a mini edit plan:\n- \"reframe\": \"crop\" if one person talking is the focus, \"fit\" if the wide frame matters (on-screen text, gameplay, multiple people spread out).\n- \"broll\": 0-2 cutaway windows where stock footage of what is being SAID would boost retention (never cover the punchline; 2-4s each). Use the absolute video time and 2-4 concrete stock-search keywords.\n- \"gifs\": 0-1 reaction-sticker moments (a joke landing, a shocking claim) with a short GIPHY search query like \"mind blown\" or \"laughing\".\n- \"zooms\": 0-2 punch-in moments on the most emphatic words (1-2s each).\nReply as JSON: {\"moments\":[{\"start\":\"M:SS\",\"end\":\"M:SS\",\"hook\":\"<=6 word overlay\",\"reframe\":\"crop\"|\"fit\",\"broll\":[{\"at\":\"M:SS\",\"dur_sec\":int,\"keywords\":[\"...\"]}],\"gifs\":[{\"at\":\"M:SS\",\"dur_sec\":int,\"query\":\"...\"}],\"zooms\":[{\"at\":\"M:SS\",\"dur_sec\":int}]}]}";
test.each([
  [undefined, MOMENTS_PROMPT],
  ['hi', `${MOMENTS_PROMPT}\nWrite each hook in Hindi.`],
] as const)('moment prompt with caption language %s', async (language, prompt) => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => answer({ moments: [moment] })); vi.stubGlobal('fetch', fetcher);
  await pickMoments({ gcsUri: 'gs://bucket/videos/u/j.mp4' }, 1, undefined, language);
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string).contents[0].parts[1].text).toBe(prompt);
});
