import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mocks = vi.hoisted(() => ({ probe: vi.fn(async () => ({ hasVideo: true, durationSec: 4, width: 640, height: 360 })), ff: vi.fn() }));
vi.mock('./ffmpeg.js', () => ({ ff: mocks.ff, ffprobe: mocks.probe }));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { async getAccessToken() { return 'test-token'; } } }));
import { detectSpeakerTrack } from './speakerTrack.js';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
const answer = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }));
async function setup() {
 const dir = await mkdtemp(join(tmpdir(), 'speaker-provider-'));
 vi.stubEnv('GEMINI_PROJECT', 'test-project'); vi.stubEnv('GEMINI_MODEL', 'gemini-vision');
 mocks.ff.mockImplementation(async (args: string[]) => writeFile(args.at(-1)!, Buffer.from('image-fixture')));
 return dir;
}
test('ordered samples are sent once, positions mapped, and images cleaned', async () => {
 const dir = await setup();
 const request = vi.fn(async () => answer('{"focus_x":[0.3,0.5,0.7]}'));
 vi.stubGlobal('fetch', request);
 try {
 const points = await detectSpeakerTrack('source', { tmpDir: dir, isPro: true });
 expect(points.map(p => p.x)).toEqual([0.3, 0.5, 0.7]); expect(points.at(-1)!.at).toBeCloseTo(3.95);
 expect(request).toHaveBeenCalledOnce();
 const body = JSON.parse((request.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
 expect(body.contents[0].parts).toHaveLength(4); expect(body.contents[0].parts[1].inlineData.mimeType).toBe('image/jpeg');
 expect((request.mock.calls[0] as unknown as [string])[0]).toContain('/models/gemini-vision:generateContent');
 expect(await readdir(dir)).toEqual([]);
 } finally { await rm(dir, { recursive: true, force: true }); }
});
test.each(['ambiguous', 'oversize', 'http', 'cancel'])('provider %s fails and cleans images', async kind => {
 const dir = await setup(), controller = new AbortController();
 vi.stubGlobal('fetch', vi.fn(async () => {
 if (kind === 'cancel') { controller.abort(Error('lease lost')); throw controller.signal.reason; }
 if (kind === 'http') return new Response('bad', { status: 503 });
 if (kind === 'oversize') return new Response('x'.repeat(1024 * 1024 + 1));
 return answer('{"focus_x":[0.3,null,0.7]}');
 }));
 try { await expect(detectSpeakerTrack('source', { tmpDir: dir, isPro: true, signal: controller.signal })).rejects.toThrow(); expect(await readdir(dir)).toEqual([]); }
 finally { await rm(dir, { recursive: true, force: true }); }
});
