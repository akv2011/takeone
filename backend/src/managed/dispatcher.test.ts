import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { dispatcher } from './dispatcher.js';
async function fixture() {
 const dispatch = vi.fn(async (_id: string) => {}); const probeUpload = vi.fn(async (_id: string) => {}); const sign = vi.fn(async (_key: string) => 'https://storage.test/signed');
 const server = createServer(dispatcher({ secret: 'test-secret', dispatch, probeUpload, sign })); server.listen(0, '127.0.0.1'); await once(server, 'listening');
 const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
 return { dispatch, probeUpload, sign, url, close: () => new Promise<void>((r) => server.close(() => r())) };
}
describe('HTTP dispatcher', () => {
 it('allows health, protects mutations and validates exact identifiers and keys', async () => {
  const f = await fixture(); try {
   expect((await fetch(f.url + '/healthz')).status).toBe(200);
   expect((await fetch(f.url + '/dispatch', { method: 'POST', body: '{}' })).status).toBe(401);
   const post = (path: string, data: unknown) => fetch(f.url + path, { method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: JSON.stringify(data) });
   expect((await post('/dispatch', { jobId: '../escape' })).status).toBe(400);
   expect((await post('/sign', { storageKey: 'other/private.mp4' })).status).toBe(400);
   expect((await post('/sign-review', { storageKey: 'captions/job/lease.json' })).status).toBe(400);
   expect((await post('/sign-review', { storageKey: 'videos/job-1/lease-1.mp4', ttlMs: 86400000 })).status).toBe(400);
   expect(await (await post('/sign-review', { storageKey: 'videos/job-1/lease-1.mp4' })).json()).toEqual({ url: 'https://storage.test/signed' });
   expect(f.sign).toHaveBeenCalledWith('videos/job-1/lease-1.mp4', 120_000);
   expect((await post('/sign-captions', { storageKey: 'videos/job/lease.mp4' })).status).toBe(400);
   expect((await post('/sign-captions', { storageKey: 'captions/../secret.json' })).status).toBe(400);
   expect(await (await post('/sign-captions', { storageKey: 'captions/job/lease.json' })).json()).toEqual({ url: 'https://storage.test/signed' });
   expect((await post('/sign-music', { storageKey: 'videos/job-1/lease-1.mp4' })).status).toBe(400);
   expect((await post('/sign-music', { storageKey: 'music/../secret.mp3' })).status).toBe(400);
   expect(await (await post('/sign-music', { storageKey: 'music/approved.mp3' })).json()).toEqual({ url: 'https://storage.test/signed' });
   expect((await post('/dispatch', { jobId: 'job-1', extra: 'bad' })).status).toBe(400);
   expect((await post('/dispatch', { jobId: 'job-1' })).status).toBe(202); expect(f.dispatch).toHaveBeenCalledWith('job-1');
   expect((await post('/probe-upload', { uploadId: '../escape' })).status).toBe(400);
   expect((await post('/probe-upload', { uploadId: 'upload-1', extra: true })).status).toBe(400);
   expect((await post('/probe-upload', { uploadId: 'upload-1' })).status).toBe(202); expect(f.probeUpload).toHaveBeenCalledWith('upload-1');
   expect(await (await post('/sign', { storageKey: 'videos/job-1/lease-1.mp4' })).json()).toEqual({ url: 'https://storage.test/signed' });
   expect((await post('/dispatch', { jobId: 'a'.repeat(20000) })).status).toBe(413);
   f.dispatch.mockRejectedValueOnce(Error('secret-key')); const failed = await post('/dispatch', { jobId: 'job-1' });
   expect(failed.status).toBe(502); expect(await failed.text()).not.toContain('secret-key');
  } finally { await f.close(); }
 });
});
