import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import type { Cue } from '../google/translate.js';
const translateCues = vi.hoisted(() => vi.fn(async (cues: readonly Cue[], target: string) => cues.map(cue => ({ ...cue, text: `${target}:${cue.text}` }))));
vi.mock('../google/translate.js', () => ({ translateCues }));
import { dispatcherWithYouTube, translateTexts } from './youtubeRoutes.js';
import type { Moment } from '../youtubeMoments.js';
import type { CaptionLanguage } from '../languages.js';

const moments: Moment[] = [{ start_sec: 12, end_sec: 40, hook: 'The twist', why: 'Setup and payoff', cues: [{ start_sec: 12, text: 'Hello' }] }];
async function fixture() {
 const dispatch = vi.fn(async (_id: string) => {});
 const findMoments = vi.fn(async (_videoId: string) => moments);
 const translate = vi.fn(async (texts: string[], language: CaptionLanguage) => texts.map(text => `${language}:${text}`));
 const deps = { secret: 'test-secret', dispatch, probeUpload: vi.fn(async () => {}), sign: vi.fn(async () => 'https://storage.test/signed'), summarize: vi.fn(), recordFeedback: vi.fn() };
 const server = createServer(dispatcherWithYouTube(deps, { findMoments, translate })); server.listen(0, '127.0.0.1'); await once(server, 'listening');
 const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
 const post = (path: string, body: string, authorization = 'Bearer test-secret') => fetch(url + path, { method: 'POST', headers: { authorization }, body });
 return { dispatch, findMoments, translate, url, post, close: () => new Promise<void>(r => server.close(() => r())) };
}
const moment = JSON.stringify({ videoId: 'dQw4w9WgXcQ' });
const texts = JSON.stringify({ language: 'hi', texts: [' Hello ', 'x'.repeat(120)] });
const padded = (bytes: number) => `{"pad":"${'a'.repeat(bytes - 10)}"}`;

describe('YouTube dispatcher routes', () => {
 it('passes every other request to the dispatcher untouched', async () => {
  const f = await fixture(); try {
   const health = await fetch(f.url + '/healthz');
   expect(health.status).toBe(200); expect(await health.json()).toEqual({ ok: true });
   expect((await f.post('/dispatch', JSON.stringify({ jobId: 'job-1' }))).status).toBe(202); expect(f.dispatch).toHaveBeenCalledWith('job-1');
   expect((await f.post('/dispatch', JSON.stringify({ jobId: 'job-1' }), 'Bearer wrong-secret')).status).toBe(401);
   expect((await f.post('/youtube-moments?x=1', moment)).status).toBe(404);
   expect(f.findMoments).not.toHaveBeenCalled();
  } finally { await f.close(); }
 });
 it('rejects a missing or wrong bearer before reading the body or calling a dependency', async () => {
  const f = await fixture(); try {
   for (const [path, body] of [['/youtube-moments', moment], ['/translate-cues', texts]]) {
    for (const authorization of ['', 'Bearer wrong-secret', 'Bearer test-secreT', 'test-secret']) {
     const response = await f.post(path, body, authorization);
     expect(response.status, `${path} ${authorization}`).toBe(401); expect(await response.json()).toEqual({ error: 'Unauthorized' });
    }
    expect((await fetch(f.url + path)).status, `${path} GET without auth`).toBe(401);
    const get = await fetch(f.url + path, { headers: { authorization: 'Bearer test-secret' } });
    expect(get.status).toBe(404); expect(await get.json()).toEqual({ error: 'Not found' });
   }
   expect(f.findMoments).not.toHaveBeenCalled(); expect(f.translate).not.toHaveBeenCalled();
  } finally { await f.close(); }
 });
 it('enforces each route body limit', async () => {
  const f = await fixture(); try {
   expect((await f.post('/youtube-moments', padded(257))).status).toBe(413);
   expect((await f.post('/youtube-moments', padded(256))).status).toBe(400);
   const large = await f.post('/translate-cues', padded(16_385));
   expect(large.status).toBe(413); expect(await large.json()).toEqual({ error: 'Request too large' });
   expect((await f.post('/translate-cues', padded(16_384))).status).toBe(400);
  } finally { await f.close(); }
 });
 it('rejects bodies outside the contract with 400 and calls nothing', async () => {
  const f = await fixture(); try {
   const invalid: Array<[string, string, unknown]> = [
    ['/youtube-moments', 'malformed JSON', '{"videoId":'],
    ['/youtube-moments', 'an array body', [{ videoId: 'dQw4w9WgXcQ' }]],
    ['/youtube-moments', 'a 10-character id', { videoId: 'dQw4w9WgXc' }],
    ['/youtube-moments', 'an id with a slash', { videoId: 'dQw4w9WgX/Q' }],
    ['/youtube-moments', 'a full URL', { videoId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
    ['/youtube-moments', 'a numeric id', { videoId: 12345678901 }],
    ['/youtube-moments', 'an extra key', { videoId: 'dQw4w9WgXcQ', start: 0 }],
    ['/youtube-moments', 'an empty object', {}],
    ['/translate-cues', 'an array body', [{ language: 'hi', texts: ['Hello'] }]],
    ['/translate-cues', 'an unknown language', { language: 'fr', texts: ['Hello'] }],
    ['/translate-cues', 'the Cloud Translation code', { language: 'zh-CN', texts: ['Hello'] }],
    ['/translate-cues', 'an inherited key as language', { language: 'toString', texts: ['Hello'] }],
    ['/translate-cues', 'an extra key', { language: 'hi', texts: ['Hello'], source: 'en' }],
    ['/translate-cues', 'a missing texts key', { language: 'hi' }],
    ['/translate-cues', 'texts that are not an array', { language: 'hi', texts: 'Hello' }],
    ['/translate-cues', '0 texts', { language: 'hi', texts: [] }],
    ['/translate-cues', '21 texts', { language: 'hi', texts: Array.from({ length: 21 }, () => 'Hi') }],
    ['/translate-cues', 'an empty text', { language: 'hi', texts: ['Hello', '   '] }],
    ['/translate-cues', 'a 121-character text', { language: 'hi', texts: ['x'.repeat(121)] }],
    ['/translate-cues', 'a non-string text', { language: 'hi', texts: [5] }],
    ['/translate-cues', 'a control character', { language: 'hi', texts: ['bell\u0007here'] }],
    ['/translate-cues', 'a newline', { language: 'hi', texts: ['one\ntwo'] }],
   ];
   for (const [path, label, body] of invalid) {
    const response = await f.post(path, typeof body === 'string' ? body : JSON.stringify(body));
    expect(response.status, `${path} ${label}`).toBe(400); expect(await response.json(), label).toEqual({ error: 'Invalid request' });
   }
   expect(f.findMoments).not.toHaveBeenCalled(); expect(f.translate).not.toHaveBeenCalled();
  } finally { await f.close(); }
 });
 it('returns moments and translations with no-store, in order and trimmed', async () => {
  const f = await fixture(); try {
   const found = await f.post('/youtube-moments', moment);
   expect(found.status).toBe(200); expect(found.headers.get('cache-control')).toBe('no-store');
   expect(await found.json()).toEqual({ moments }); expect(f.findMoments).toHaveBeenCalledWith('dQw4w9WgXcQ');
   const translated = await f.post('/translate-cues', texts);
   expect(translated.status).toBe(200); expect(translated.headers.get('cache-control')).toBe('no-store');
   expect(await translated.json()).toEqual({ texts: ['hi:Hello', `hi:${'x'.repeat(120)}`] });
   expect(f.translate).toHaveBeenCalledWith(['Hello', 'x'.repeat(120)], 'hi');
   const most = await f.post('/translate-cues', JSON.stringify({ language: 'zh', texts: Array.from({ length: 20 }, (_, i) => `line ${i}`) }));
   expect(most.status).toBe(200); expect((await most.json()).texts).toHaveLength(20);
  } finally { await f.close(); }
 });
 it('answers 502 without provider detail when a dependency throws', async () => {
  const f = await fixture(); try {
   f.findMoments.mockRejectedValueOnce(Error('Gemini rejected the request (403) provider-detail'));
   const found = await f.post('/youtube-moments', moment);
   expect(found.status).toBe(502); expect(await found.text()).toBe('{"error":"Service unavailable"}');
   f.translate.mockRejectedValueOnce(Error('Cloud Translation rejected the request (403) provider-detail'));
   const translated = await f.post('/translate-cues', texts);
   expect(translated.status).toBe(502); expect(await translated.text()).toBe('{"error":"Service unavailable"}');
  } finally { await f.close(); }
 });
});

it('translateTexts sends the Cloud Translation code and keeps order', async () => {
 expect(await translateTexts(['Hello', 'World'], 'zh')).toEqual(['zh-CN:Hello', 'zh-CN:World']);
 expect(translateCues).toHaveBeenCalledWith([{ start: 0, end: 0, text: 'Hello' }, { start: 0, end: 0, text: 'World' }], 'zh-CN');
});
