import { afterEach, expect, it, vi } from 'vitest';

const getAccessToken = vi.hoisted(() => vi.fn(async () => 'fixture-token' as string | null));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { getAccessToken = getAccessToken; } }));
const { googleFetch, googleJson, requireEnv } = await import('./auth.js');

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); getAccessToken.mockClear(); });

it('sends the ADC bearer token and JSON body, and returns parsed JSON', async () => {
  const fetcher = vi.fn(async () => Response.json({ ok: 1 }));
  vi.stubGlobal('fetch', fetcher);
  expect(await googleJson('Test API', 'https://example.googleapis.com/v1/x', { json: { a: 1 }, timeoutMs: 1000 })).toEqual({ ok: 1 });
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://example.googleapis.com/v1/x');
  expect(init).toMatchObject({ method: 'POST', body: '{"a":1}', headers: { authorization: 'Bearer fixture-token', 'content-type': 'application/json' } });
});

it('rejects non-2xx with the status and malformed JSON with a clear error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })));
  await expect(googleFetch('Test API', 'https://example.googleapis.com', { timeoutMs: 1000 })).rejects.toThrow('Test API rejected the request (403)');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
  await expect(googleJson('Test API', 'https://example.googleapis.com', { timeoutMs: 1000 })).rejects.toThrow('Test API returned malformed JSON');
});

it('fails closed when ADC yields no token', async () => {
  getAccessToken.mockResolvedValueOnce(null);
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(googleFetch('Test API', 'https://example.googleapis.com', { timeoutMs: 1000 })).rejects.toThrow('credentials unavailable');
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects with the caller abort reason, and separately reports its own timeout', async () => {
  const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))));
  vi.stubGlobal('fetch', hang);
  const controller = new AbortController();
  const pending = googleFetch('Test API', 'https://example.googleapis.com', { signal: controller.signal, timeoutMs: 60_000 });
  await vi.waitFor(() => expect(hang).toHaveBeenCalledOnce());
  controller.abort(Error('lease lost'));
  await expect(pending).rejects.toThrow('lease lost');
  await expect(googleFetch('Test API', 'https://example.googleapis.com', { timeoutMs: 5 })).rejects.toThrow('Test API request timed out');
});

it('requireEnv trims, falls back, and throws when both are missing', () => {
  vi.stubEnv('PRIMARY_X', ''); vi.stubEnv('FALLBACK_X', ' fallback-value ');
  expect(requireEnv('PRIMARY_X', 'FALLBACK_X')).toBe('fallback-value');
  vi.stubEnv('PRIMARY_X', 'primary');
  expect(requireEnv('PRIMARY_X', 'FALLBACK_X')).toBe('primary');
  vi.stubEnv('PRIMARY_X', ''); vi.stubEnv('FALLBACK_X', '');
  expect(() => requireEnv('PRIMARY_X', 'FALLBACK_X')).toThrow('PRIMARY_X (or FALLBACK_X) is required');
});
