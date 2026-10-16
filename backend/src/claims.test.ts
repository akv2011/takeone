import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const token = vi.hoisted(() => vi.fn(async () => 'test-token'));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = token; } }));
import { checkClaims, parseVerdict } from './claims.js';

const answer = (text: string, groundingMetadata?: unknown) =>
  Response.json({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', groundingMetadata }] });
const redirect = (id: string) => `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${id}`;
type Body = { contents: { parts: { text: string }[] }[]; tools?: unknown; generationConfig?: unknown };
const bodies = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as Body);
const signal = () => AbortSignal.timeout(5_000);

beforeEach(() => { vi.stubEnv('GEMINI_PROJECT', 'test-project'); vi.stubEnv('GEMINI_MODEL', 'gemini-test'); vi.stubEnv('GEMINI_LOCATION', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

test('lists claims, checks each with Google Search and takes only cited sources from grounding metadata', async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Body;
    const prompt = body.contents[0].parts[0].text;
    if (!body.tools) return answer(JSON.stringify({ claims: ['The Eiffel Tower is 330 metres tall.', 'Water boils at 50 C at sea level.', ' The Eiffel Tower is 330 metres tall. '] }));
    if (prompt.includes('Eiffel')) return answer('**VERDICT:** supported\n**REASON:** The operator lists 330 m, see https://made-up.example/proof', {
      webSearchQueries: ['eiffel tower height', 'eiffel tower height', '  '],
      groundingChunks: [
        { web: { uri: redirect('a'), title: 'toureiffel.paris' } },
        { web: { uri: 'http://insecure.example/page', title: 'insecure' } },
        { web: { uri: redirect('b'), domain: 'britannica.com' } },
        { web: { uri: redirect('c'), title: 'wikipedia.org' } },
        { web: { uri: redirect('d'), title: 'fourth.example' } },
      ],
      groundingSupports: [{ segment: { startIndex: 0, endIndex: 20, text: 'The operator lists 330 m' }, groundingChunkIndices: [2, 0] }, { groundingChunkIndices: [0, 1, 99] }],
    });
    return answer('VERDICT: disputed\nREASON: Sources put it at 100 C at sea level.');
  });
  vi.stubGlobal('fetch', fetcher);
  expect(await checkClaims('Did you know the Eiffel Tower is 330 metres tall? Water boils at 50 C.', signal())).toEqual({ status: 'checked', claims: [
    { text: 'The Eiffel Tower is 330 metres tall.', verdict: 'supported', reason: 'The operator lists 330 m, see https://made-up.example/proof',
      sources: [{ url: redirect('b'), title: 'britannica.com' }, { url: redirect('a'), title: 'toureiffel.paris' }],
      searches: ['eiffel tower height'] },
    { text: 'Water boils at 50 C at sea level.', verdict: 'disputed', reason: 'Sources put it at 100 C at sea level.', sources: [], searches: [] },
  ] });
  const [list, ...checks] = bodies(fetcher);
  expect(list.tools).toBeUndefined();
  expect(list.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
  expect(list.contents[0].parts[0].text).toContain('<video_text>\nDid you know the Eiffel Tower');
  expect(checks).toHaveLength(2);
  for (const check of checks) {
    expect(check.tools).toEqual([{ googleSearch: {} }]);
    // Only the thinking level: a response schema must never ride along with the search tool.
    expect(check.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'LOW' } });
  }
});

test('no checkable claims makes no Search call', async () => {
  const fetcher = vi.fn(async () => answer('{"claims":[]}')); vi.stubGlobal('fetch', fetcher);
  expect(await checkClaims('I love this song so much.', signal())).toEqual({ status: 'checked', claims: [] });
  expect(fetcher).toHaveBeenCalledOnce();
});

test.each([
  ['a check without a verdict', () => answer('The claim looks right to me.')],
  ['a provider error on one check', () => new Response('quota', { status: 429 })],
])('%s rejects the whole check', async (_name, failing) => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) =>
    JSON.parse(init.body as string).tools ? failing() : answer('{"claims":["The Moon orbits Earth."]}')));
  await expect(checkClaims('The Moon orbits Earth.', signal())).rejects.toThrow();
});

test.each([
  ['VERDICT: supported\nREASON: Matches NASA data.', { verdict: 'supported', reason: 'Matches NASA data.' }],
  ['**Verdict**: Disputed\n**Reason:** Two sources disagree.', { verdict: 'disputed', reason: 'Two sources disagree.' }],
  ['Here you go.\nVERDICT: unverified\nREASON: No source settles it.', { verdict: 'unverified', reason: 'No source settles it.' }],
])('parses %j', (text, expected) => { expect(parseVerdict(text)).toEqual(expected); });

test.each(['VERDICT: true\nREASON: yes', 'VERDICT: supported', `VERDICT: supported\nREASON: ${'x'.repeat(501)}`])('rejects %j', text => {
  expect(() => parseVerdict(text)).toThrow('Gemini returned no verdict');
});
