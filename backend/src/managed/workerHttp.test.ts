import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudRunIdentity } from './cloudRun.js';
import { workerHandler } from './workerHttp.js';
async function fixture() {
  const run = vi.fn(async (_identity: CloudRunIdentity) => 'worker_completed');
  const server = createServer(workerHandler(run)); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (body: string) => fetch(url + '/run', { method: 'POST', body });
  return { run, url, post, close: () => new Promise<void>(r => server.close(() => r())) };
}
beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });
describe('worker HTTP handler', () => {
  it('routes health, methods and unknown paths', async () => {
    const f = await fixture(); try {
      const health = await fetch(f.url + '/healthz');
      expect(health.status).toBe(200); expect(await health.json()).toEqual({ ok: true });
      expect((await fetch(f.url + '/healthz', { method: 'POST' })).status).toBe(405);
      const get = await fetch(f.url + '/run');
      expect(get.status).toBe(405); expect(await get.json()).toEqual({ error: 'Method not allowed' });
      expect((await fetch(f.url + '/other', { method: 'POST', body: '{}' })).status).toBe(404);
      expect(f.run).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it('runs exactly the posted identity and returns its outcome', async () => {
    const f = await fixture(); try {
      const job = await f.post(JSON.stringify({ jobId: 'job-1' }));
      expect(job.status).toBe(200); expect(await job.json()).toEqual({ outcome: 'worker_completed' });
      expect(f.run).toHaveBeenLastCalledWith({ jobId: 'job-1' }); expect(console.log).toHaveBeenLastCalledWith('worker_completed');
      f.run.mockResolvedValueOnce('upload_probe_completed');
      const upload = await f.post(JSON.stringify({ uploadId: 'upload-1' }));
      expect(upload.status).toBe(200); expect(await upload.json()).toEqual({ outcome: 'upload_probe_completed' });
      expect(f.run).toHaveBeenLastCalledWith({ uploadId: 'upload-1' });
    } finally { await f.close(); }
  });
  it('rejects every body that is not exactly one valid identity', async () => {
    const f = await fixture(); try {
      const invalid: Array<[string, string]> = [
        ['non-JSON', 'jobId=job-1'],
        ['null', 'null'],
        ['an array', '[]'],
        ['an empty object', '{}'],
        ['a path id', JSON.stringify({ jobId: '../x' })],
        ['a numeric id', JSON.stringify({ jobId: 5 })],
        ['both keys', JSON.stringify({ jobId: 'job-1', uploadId: 'upload-1' })],
        ['an extra key', JSON.stringify({ jobId: 'job-1', extra: true })],
        ['a 2000-byte body', JSON.stringify({ jobId: 'job-1' }) + ' '.repeat(2000 - 17)],
      ];
      for (const [label, body] of invalid) {
        const response = await f.post(body);
        expect(response.status, label).toBe(400); expect(await response.json(), label).toEqual({ error: 'Invalid request' });
      }
      expect(f.run).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it('refuses a second run while one is in progress', async () => {
    const f = await fixture(); try {
      let release!: (outcome: string) => void;
      f.run.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
      const first = f.post(JSON.stringify({ jobId: 'job-1' }));
      await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1));
      const busy = await f.post(JSON.stringify({ jobId: 'job-2' }));
      expect(busy.status).toBe(429); expect(await busy.json()).toEqual({ error: 'Busy' });
      release('worker_lost');
      const done = await first;
      expect(done.status).toBe(200); expect(await done.json()).toEqual({ outcome: 'worker_lost' });
      expect((await f.post(JSON.stringify({ jobId: 'job-3' }))).status).toBe(200);
      expect(f.run.mock.calls).toEqual([[{ jobId: 'job-1' }], [{ jobId: 'job-3' }]]);
    } finally { await f.close(); }
  });
  it('answers a failed run with a fixed 500 and keeps serving', async () => {
    const f = await fixture(); try {
      f.run.mockRejectedValueOnce(Error('secret-detail'));
      const failed = await f.post(JSON.stringify({ jobId: 'job-1' }));
      expect(failed.status).toBe(500); expect(await failed.text()).toBe('{"error":"Run failed"}');
      expect(console.error).toHaveBeenCalledWith('worker_failed');
      expect((await f.post(JSON.stringify({ jobId: 'job-1' }))).status).toBe(200);
    } finally { await f.close(); }
  });
});
