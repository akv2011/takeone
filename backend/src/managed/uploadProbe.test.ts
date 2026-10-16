import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { runUploadProbe, workerIdentity } from './uploadProbe.js';

describe('upload probe worker', () => {
  it('requires mutually exclusive job and upload identities', () => {
    expect(() => workerIdentity({})).toThrow('Exactly one');
    expect(() => workerIdentity({ TAKEONE_JOB_ID: 'job', TAKEONE_UPLOAD_ID: 'upload' })).toThrow('Exactly one');
    expect(workerIdentity({ TAKEONE_UPLOAD_ID: 'upload' })).toEqual({ uploadId: 'upload' });
  });
  it('bounded-downloads and probes real video before recording trusted metadata', async () => {
    const server = createServer((_req, res) => createReadStream('fixtures/sample.mp4').pipe(res));
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/source`;
    const complete = vi.fn(async () => true), fail = vi.fn(async () => true);
    try {
      await expect(runUploadProbe('upload-1', {
        claim: async () => ({ uploadId: 'upload-1', userId: 'u1', storageId: 'storage-1', storageUrl: url, size: 162639, probeToken: 'token-1', probeExpiresAt: Date.now() + 90_000 }),
        complete, fail,
      })).resolves.toBe('completed');
      expect(complete).toHaveBeenCalledWith(expect.objectContaining({ uploadId: 'upload-1', storageId: 'storage-1', probeToken: 'token-1', mediaDurationMs: expect.any(Number), mediaWidth: expect.any(Number), mediaHeight: expect.any(Number), mediaHasAudio: expect.any(Boolean) }));
      expect(fail).not.toHaveBeenCalled();
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  }, 30_000);

  it('fails invalid media through the exact claim fence', async () => {
    const complete = vi.fn(async () => true), fail = vi.fn(async () => true);
    await expect(runUploadProbe('upload-1', {
      claim: async () => ({ uploadId: 'upload-1', userId: 'u1', storageId: 'storage-1', storageUrl: 'https://storage.test/source', size: 4, probeToken: 'token-1', probeExpiresAt: Date.now() + 90_000 }),
      complete, fail,
      fetch: async () => new Response('nope'),
      probe: async () => ({ durationSec: 0, width: 0, height: 0, hasAudio: false, hasVideo: false }),
    })).resolves.toBe('failed');
    expect(fail).toHaveBeenCalledWith({ uploadId: 'upload-1', storageId: 'storage-1', probeToken: 'token-1' });
    expect(complete).not.toHaveBeenCalled();
  });
});
