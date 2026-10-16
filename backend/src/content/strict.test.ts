import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('google-auth-library', () => ({ GoogleAuth: class { async getAccessToken() { return 'test-token'; } } }));
import { content } from './index.js';
const angle = { hook: 'Watch the sunrise', premise: 'Light changes the mountain view', whyViral: 'A clear visual story' };
const script = 'Watch the sunrise across the mountains as the shadows slowly give way to light. A familiar view changes with every passing minute.';
beforeEach(() => { vi.stubEnv('GEMINI_PROJECT', 'test-project'); vi.stubEnv('GEMINI_MODEL', 'gemini-configured'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const response = (value: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }] }));

test('production requires explicit provider/model configuration before making a request', async () => {
 const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
 vi.stubEnv('GEMINI_MODEL', '');
 await expect(content.brainstorm('mountains', [], { strict: true })).rejects.toThrow('GEMINI_MODEL');
 expect(fetcher).not.toHaveBeenCalled();
 expect(await content.brainstorm('mountains')).toHaveLength(3);
});
test('production rejects provider failures instead of generic fallback narration', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not authorized', { status: 401 })));
 await expect(content.brainstorm('mountains', [], { strict: true })).rejects.toThrow('Gemini rejected the request (401)');
 await expect(content.script(angle, [], { strict: true })).rejects.toThrow('Gemini rejected the request (401)');
 expect((await content.script(angle)).script).toContain(angle.hook);
});
test.each([[], [{}], [{ ...angle, hook: 1 }], 'invalid'])('production rejects malformed angle output %j', async value => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
 await expect(content.brainstorm('mountains', [], { strict: true })).rejects.toThrow('invalid angles');
});
test.each([null, { script: [] }, { script: 'one word' }, { script: 'word '.repeat(121) }])('production rejects malformed narration %j', async value => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
 await expect(content.script(angle, [], { strict: true })).rejects.toThrow('invalid narration');
});
test('valid provider text is retained and the configured model is used', async () => {
 const fetcher = vi.fn().mockResolvedValueOnce(response([angle])).mockResolvedValueOnce(response({ script })); vi.stubGlobal('fetch', fetcher);
 expect(await content.brainstorm('mountains', [], { strict: true })).toEqual([angle]);
 expect(await content.script(angle, [], { strict: true })).toEqual({ script, captions: script });
 expect(fetcher.mock.calls[0][0]).toContain('/models/gemini-configured:generateContent');
 expect(JSON.parse(fetcher.mock.calls[0][1].body).generationConfig.responseSchema.type).toBe('array');
});
test('a lost worker lease aborts an in-flight script provider request', async () => {
 const controller = new AbortController();
 vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('transport cancelled'))))));
 const result = content.brainstorm('mountains', [], { strict: true, signal: controller.signal });
 controller.abort(Error('lease lost'));
 await expect(result).rejects.toThrow('lease lost');
});

// Captured from the pre-change prompt builder: an unset language must send it byte for byte.
const SCRIPT_PROMPT = 'Write a 45-55 word voiceover script for this angle. Hook first line. Ground it in: Fact one. JSON {script, captions}. Angle: {"hook":"Watch the sunrise","premise":"Light changes the mountain view","whyViral":"A clear visual story"}';
test.each([
  [undefined, SCRIPT_PROMPT],
  ['ja', `${SCRIPT_PROMPT} Write the script and captions in Japanese.`],
] as const)('script prompt with caption language %s', async (language, prompt) => {
 const fetcher = vi.fn().mockResolvedValue(response({ script })); vi.stubGlobal('fetch', fetcher);
 expect(await content.script(angle, ['Fact one.'], { strict: true, language })).toEqual({ script, captions: script });
 expect(JSON.parse(fetcher.mock.calls[0][1].body).contents[0].parts[0].text).toBe(prompt);
});
test('a Japanese script without spaces is counted in dictionary words only when the language is set', async () => {
 const japanese = '朝の光が山の稜線を照らし始めると、影はゆっくりと谷の奥へ退いていきます。毎朝同じ景色なのに、少しずつ表情が変わりますね。';
 expect([...japanese]).toHaveLength(60); expect(japanese).not.toMatch(/\s/);
 vi.stubGlobal('fetch', vi.fn(async () => response({ script: japanese })));
 expect((await content.script(angle, [], { strict: true, language: 'ja' })).script).toBe(japanese);
 await expect(content.script(angle, [], { strict: true })).rejects.toThrow('invalid narration');
});
