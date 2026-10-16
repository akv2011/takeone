import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { async getAccessToken() { return 'test-token'; } } }));
import { spawn } from 'node:child_process';
import { pickMoments } from './moments.js';

const answer = (value: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }] }));
const moment = { start_sec: 70, end_sec: 95, hook: 'He actually said it', reframe: 'crop', broll: [{ at_sec: 80, dur_sec: 3, keywords: ['city night'] }], zooms: [{ at_sec: 90, dur_sec: 1 }] };
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
  vi.stubGlobal('fetch', vi.fn(async () => answer({ moments: [{ ...moment, end_sec: 60 }] })));
  await expect(pickMoments({ gcsUri: 'gs://bucket/videos/u/j.mp4' }, 1)).rejects.toThrow('could not find good moments');
});
test('missing Gemini configuration fails before any subtitle download', async () => {
  vi.stubEnv('GEMINI_MODEL', '');
  await expect(pickMoments({ youtubeUrl: 'https://youtu.be/abc' }, 1)).rejects.toThrow('GEMINI_MODEL');
  expect(spawn).not.toHaveBeenCalled();
});
