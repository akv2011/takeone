import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { content } from './index.js';
const angle = { hook: 'Watch the sunrise', premise: 'Light changes the mountain view', whyViral: 'A clear visual story' };
const script = 'Watch the sunrise across the mountains as the shadows slowly give way to light. A familiar view changes with every passing minute.';
beforeEach(() => { vi.stubEnv('LLM_API_KEY', 'test-key'); vi.stubEnv('LLM_MODEL', 'configured-model'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));

test('production requires explicit provider/model configuration before making a request', async () => {
 const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
 vi.stubEnv('LLM_MODEL', '');
 await expect(content.brainstorm('mountains', [], { strict: true })).rejects.toThrow('LLM_MODEL');
 expect(fetcher).not.toHaveBeenCalled();
 expect(await content.brainstorm('mountains')).toHaveLength(3);
});
test('production rejects provider failures instead of generic fallback narration', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not authorized', { status: 401 })));
 await expect(content.brainstorm('mountains', [], { strict: true })).rejects.toThrow('provider failed');
 await expect(content.script(angle, [], { strict: true })).rejects.toThrow('provider failed');
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
 expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('configured-model');
});
test('a lost worker lease aborts an in-flight script provider request', async () => {
 const controller = new AbortController();
 vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('transport cancelled'))))));
 const result = content.brainstorm('mountains', [], { strict: true, signal: controller.signal });
 controller.abort(Error('lease lost'));
 await expect(result).rejects.toThrow('lease lost');
});

test('script and angle generation work with models that reject sampling overrides', async () => {
 const fetcher = vi.fn(async (_url, init) => {
  const body = JSON.parse(init.body);
  if ('temperature' in body) return new Response(JSON.stringify({ error: { code: 'unsupported_value', param: 'temperature' } }), { status: 400 });
  return response(body.messages[1].content.startsWith('Give 3') ? [angle] : { script });
 });
 vi.stubGlobal('fetch', fetcher);
 expect(await content.brainstorm('mountains', [], { strict: true })).toEqual([angle]);
 expect((await content.script(angle, [], { strict: true })).script).toBe(script);
 expect(fetcher).toHaveBeenCalledTimes(2);
});
