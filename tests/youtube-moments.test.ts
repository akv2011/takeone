import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeFunctionReference as ref } from 'convex/server';
import schema from '../convex/schema';
import { parseYouTubeLink } from '../convex/youtubeValues';
import { sharedMoment, youtubeDailyCap } from '../convex/youtubeMoments';
const modules = import.meta.glob('../convex/**/*.ts');
const VIDEO = 'dQw4w9WgXcQ';
const MOMENTS = [
  { start_sec: 10, end_sec: 40, hook: 'Hook one', why: 'Why one', cues: [{ start_sec: 10, text: 'First line' }, { start_sec: 14, text: 'Second line' }] },
  { start_sec: 100, end_sec: 130, hook: 'Hook two', why: 'Why two', cues: [{ start_sec: 100, text: 'Third line' }] },
  { start_sec: 200, end_sec: 245, hook: 'Hook three', why: 'Why three', cues: [{ start_sec: 200, text: 'Fourth line' }] },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Route = (path: string, body: any) => Response | Promise<Response>;
const translateWith = (respond: Route): Route => (path, body) => path === '/youtube-moments' ? json({ moments: MOMENTS }) : respond(path, body);
const dispatcherReply = translateWith((_path, body) => json({ texts: body.texts.map((text: string) => `hi: ${text}`) }));
function stubDispatcher(route: Route = dispatcherReply) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => route(new URL(url).pathname, JSON.parse(init.body as string)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(2_000_000); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup() {
  const t = convexTest(schema, modules), owner = t.withIdentity({ subject: 'owner' }), other = t.withIdentity({ subject: 'other' });
  type Caller = { action: typeof t.action };
  const analyze = (who: Caller = owner, url = `https://youtu.be/${VIDEO}`) => who.action(ref<'action'>('youtubeMoments:analyze'), { url });
  const latest = (who: { query: typeof t.query } = owner) => who.query(ref<'query'>('youtubeMoments:latest'), {});
  const translate = (id: string, moment = 0, language = 'hi', who: Caller = owner) => who.action(ref<'action'>('youtubeMoments:translate'), { id, moment, language });
  const share = (id: string, moment = 0, who: Caller = owner) => who.action(ref<'action'>('youtubeMoments:share'), { id, moment });
  const shared = (token: string) => t.query(ref<'query'>('youtubeMoments:shared'), { token });
  const reserve = () => owner.mutation(ref<'mutation'>('youtubeMoments:reserve'), { videoId: VIDEO });
  const status = async (id: any) => (await t.run(ctx => ctx.db.get(id)))!.status;
  return { t, owner, other, analyze, latest, translate, share, shared, reserve, status };
}

test.each([
  `https://www.youtube.com/watch?v=${VIDEO}`, `youtube.com/watch?v=${VIDEO}`, `http://youtube.com/watch?v=${VIDEO}`,
  `https://m.youtube.com/watch?v=${VIDEO}`, `https://www.youtube.com/watch?v=${VIDEO}&t=42s&si=abc`,
  `https://youtu.be/${VIDEO}?si=abc`, `youtu.be/${VIDEO}/`, `https://www.youtube.com/shorts/${VIDEO}`,
])('reads the video id from %s', input => {
  expect(parseYouTubeLink(input)).toEqual({ videoId: VIDEO });
});
test.each([
  'https://www.youtube.com/playlist?list=PL0123456789', `https://www.youtube.com/watch?v=${VIDEO}&list=PL0123456789`, `https://youtu.be/${VIDEO}?list=PL0123456789`,
])('refuses the playlist link %s', input => {
  expect(parseYouTubeLink(input)).toEqual({ error: 'playlist' });
});
test.each([
  `https://www.youtube.com/embed/${VIDEO}`, 'https://www.youtube.com/channel/UC0123456789', `https://www.youtube.com/live/${VIDEO}`,
  `https://vimeo.com/watch?v=${VIDEO}`, `https://youtube.com.evil.com/watch?v=${VIDEO}`, `https://evil.com/youtube.com/watch?v=${VIDEO}`,
  'https://www.youtube.com/watch?v=dQw4w9WgXc', "https://www.youtube.com/watch?v=dQw4w9WgX'c", `https://user:pass@www.youtube.com/watch?v=${VIDEO}`,
  `https://www.youtube.com:8443/watch?v=${VIDEO}`, 'javascript:alert(1)', `ftp://www.youtube.com/watch?v=${VIDEO}`, '', '   ',
  `https://www.youtube.com/shorts/${VIDEO}/extra`, `https://vimeo.com/watch?v=${VIDEO}&list=PL0123456789`,
])('refuses %j', input => {
  expect(parseYouTubeLink(input)).toEqual({ error: 'invalid' });
});

test('analyze sends only the video id and the owner reads the stored moments', async () => {
  const { t, analyze, latest } = setup();
  const fetchMock = stubDispatcher(), timeout = vi.spyOn(AbortSignal, 'timeout');
  const { id } = await analyze(undefined, `www.youtube.com/watch?v=${VIDEO}&t=42s`);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('https://dispatcher.example/youtube-moments', expect.objectContaining({
    method: 'POST', body: `{"videoId":"${VIDEO}"}`, headers: expect.objectContaining({ authorization: 'Bearer test-dispatch-secret' }),
  }));
  expect(timeout).toHaveBeenCalledWith(60_000);
  expect(await latest()).toEqual({ id, videoId: VIDEO, status: 'done', moments: MOMENTS, translations: [], createdAt: 2_000_000 });
  expect((await t.run(ctx => ctx.db.get(id)))!.url).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
});
test.each([['a playlist', 'https://youtu.be/dQw4w9WgXcQ?list=PL0123456789', 'YOUTUBE_PLAYLIST'], ['an invalid link', 'https://vimeo.com/1', 'YOUTUBE_URL']])('analyze refuses %s before spending anything', async (_name, url, code) => {
  const { t, analyze } = setup();
  const fetchMock = stubDispatcher();
  await expect(analyze(undefined, url)).rejects.toThrow(code);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run(ctx => ctx.db.query('youtubeMoments').collect())).toEqual([]);
});

test('each account gets three analyses an hour, failed ones included', async () => {
  const { t, other, analyze } = setup();
  const fetchMock = stubDispatcher();
  fetchMock.mockImplementationOnce(async () => json({ error: 'Service unavailable' }, 502));
  await expect(analyze()).rejects.toThrow('MOMENTS_UNAVAILABLE');
  await analyze(); await analyze();
  await expect(analyze()).rejects.toThrow('YOUTUBE_RATE_LIMIT');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await expect(analyze(other)).resolves.toBeTruthy();
  vi.advanceTimersByTime(3_600_000);
  await t.finishInProgressScheduledFunctions();
  await expect(analyze()).resolves.toBeTruthy();
});
test('the daily cap counts every account and resets at UTC midnight', async () => {
  const { t, other, analyze } = setup();
  const fetchMock = stubDispatcher(), third = t.withIdentity({ subject: 'third' });
  vi.stubEnv('YOUTUBE_DAILY_CAP', '2');
  await analyze(); await analyze(other);
  await expect(analyze(third)).rejects.toThrow('YOUTUBE_DAILY_CAP');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  vi.setSystemTime(86_400_000);
  await expect(analyze(third)).resolves.toBeTruthy();
});
test('a cap of 0 turns analysis off and a non-numeric cap falls back to 100', async () => {
  const { analyze } = setup();
  const fetchMock = stubDispatcher();
  vi.stubEnv('YOUTUBE_DAILY_CAP', '0');
  await expect(analyze()).rejects.toThrow('YOUTUBE_DAILY_CAP');
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv('YOUTUBE_DAILY_CAP', 'lots');
  await expect(analyze()).resolves.toBeTruthy();
});
test.each([[undefined, 100], ['', 100], [' 5 ', 5], ['0', 0], ['-1', 100], ['1.5', 100], ['1e3', 100], ['lots', 100], ['9007199254740993', 100]])('youtubeDailyCap(%j) is %i', (value, cap) => {
  expect(youtubeDailyCap({ YOUTUBE_DAILY_CAP: value })).toBe(cap);
});

test.each([
  ['the dispatcher is unreachable', async () => { throw new TypeError('fetch failed'); }],
  ['the dispatcher returns 500', async () => json({ error: 'Service unavailable' }, 500)],
  ['the moments fail the validator', async () => json({ moments: [{ ...MOMENTS[0], cues: 'none' }] })],
] as [string, Route][])('analyze leaves the row failed when %s', async (_name, route) => {
  const { analyze, latest } = setup();
  stubDispatcher(route);
  await expect(analyze()).rejects.toThrow('MOMENTS_UNAVAILABLE');
  expect(await latest()).toEqual({ id: expect.any(String), videoId: VIDEO, status: 'failed', createdAt: 2_000_000 });
});
test('the scheduled check fails a stuck analysis after 120 seconds and leaves a done one alone', async () => {
  const { t, analyze, reserve, status } = setup();
  stubDispatcher();
  const { id: done } = await analyze(), stuck = await reserve();
  vi.advanceTimersByTime(119_999);
  await t.finishInProgressScheduledFunctions();
  expect(await status(stuck)).toBe('running');
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  expect(await status(stuck)).toBe('failed');
  expect(await status(done)).toBe('done');
  await expect(t.mutation(ref<'mutation'>('youtubeMoments:finish'), { id: stuck, moments: MOMENTS })).rejects.toThrow('MOMENTS_UNAVAILABLE');
  expect(await status(stuck)).toBe('failed');
});

test('only the owner reads, translates or shares an analysis', async () => {
  const { t, other, analyze, latest, translate, share } = setup();
  const fetchMock = stubDispatcher();
  await expect(analyze(t)).rejects.toThrow('UNAUTHENTICATED');
  expect(fetchMock).not.toHaveBeenCalled();
  const { id } = await analyze();
  expect(await latest(t)).toBeNull();
  expect(await latest(other)).toBeNull();
  await analyze(other, 'https://youtu.be/aaaaaaaaaaa');
  expect(await latest(other)).toMatchObject({ videoId: 'aaaaaaaaaaa' });
  expect(await latest()).toMatchObject({ id, videoId: VIDEO });
  await expect(translate(id, 0, 'hi', other)).rejects.toThrow('MOMENTS_UNAVAILABLE');
  await expect(share(id, 0, other)).rejects.toThrow('MOMENTS_UNAVAILABLE');
  await expect(translate(id, 0, 'hi', t)).rejects.toThrow('UNAUTHENTICATED');
  await expect(share(id, 0, t)).rejects.toThrow('UNAUTHENTICATED');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('translate sends the cue texts once, then serves the stored translation', async () => {
  const { analyze, translate, latest } = setup();
  const fetchMock = stubDispatcher();
  const { id } = await analyze();
  expect(await translate(id)).toEqual(['hi: First line', 'hi: Second line']);
  expect(fetchMock).toHaveBeenLastCalledWith('https://dispatcher.example/translate-cues', expect.objectContaining({ body: JSON.stringify({ language: 'hi', texts: ['First line', 'Second line'] }) }));
  expect(await translate(id)).toEqual(['hi: First line', 'hi: Second line']);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(await latest()).toMatchObject({ translations: [{ moment: 0, language: 'hi', texts: ['hi: First line', 'hi: Second line'] }] });
});
test.each([
  ['the wrong length', () => json({ texts: ['only one'] })],
  ['a blank text', () => json({ texts: ['one', ' '] })],
  ['a text over 500 characters', () => json({ texts: ['one', 'x'.repeat(501)] })],
  ['no array', () => json({ texts: 'one two' })],
  ['a 500', () => json({ error: 'Service unavailable' }, 500)],
] as [string, Route][])('a translation reply with %s is refused and not stored', async (_name, respond) => {
  const { analyze, translate, latest } = setup();
  stubDispatcher(translateWith(respond));
  const { id } = await analyze();
  await expect(translate(id, 0, 'ta')).rejects.toThrow('TRANSLATION_UNAVAILABLE');
  expect(await latest()).toMatchObject({ translations: [] });
});
test('translate and share need a done analysis and a real moment', async () => {
  const { analyze, reserve, translate, share } = setup();
  const fetchMock = stubDispatcher();
  const { id } = await analyze(), running = await reserve();
  await expect(translate(running)).rejects.toThrow('MOMENTS_UNAVAILABLE');
  await expect(share(running)).rejects.toThrow('MOMENTS_UNAVAILABLE');
  for (const moment of [-1, 1.5, 3]) {
    await expect(translate(id, moment)).rejects.toThrow('MOMENTS_UNAVAILABLE');
    await expect(share(id, moment)).rejects.toThrow('MOMENTS_UNAVAILABLE');
  }
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a share link opens one moment of the video and nothing else', async () => {
  const { t, analyze, share, shared } = setup();
  stubDispatcher();
  const { id } = await analyze();
  const { token } = await share(id, 1);
  expect(token).toMatch(/^[a-f0-9]{32}$/);
  expect(await share(id, 1)).toEqual({ token });
  expect((await share(id, 2)).token).not.toBe(token);
  expect(await t.run(ctx => ctx.db.query('youtubeShares').collect())).toHaveLength(2);
  const view = await shared(token);
  expect(view).toEqual({ videoId: VIDEO, moment: MOMENTS[1] });
  expect(JSON.stringify(view)).not.toMatch(/owner|userId|url|createdAt|watch|translations|Hook one|Hook three/);
});
test.each(['', 'a'.repeat(31), 'A'.repeat(32), `${'a'.repeat(32)}a`, 'a'.repeat(32)])('a malformed or unknown token reads nothing (%j)', async token => {
  const { shared } = setup();
  expect(await shared(token)).toBeNull();
});
test('sharedMoment returns nothing unless the analysis is done and has that moment', () => {
  const row = { _id: 'row', userId: 'owner', videoId: VIDEO, url: '', createdAt: 0 };
  expect(sharedMoment(null, 0)).toBeNull();
  expect(sharedMoment({ ...row, status: 'failed' }, 0)).toBeNull();
  expect(sharedMoment({ ...row, status: 'done', moments: MOMENTS, translations: [] }, 3)).toBeNull();
  expect(sharedMoment({ ...row, status: 'done', moments: MOMENTS, translations: [] }, 2)).toEqual({ videoId: VIDEO, moment: MOMENTS[2] });
});
