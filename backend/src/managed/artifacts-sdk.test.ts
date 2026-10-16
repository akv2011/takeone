import { expect, test, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Storage } from '@google-cloud/storage';
import { uploadArtifacts } from './artifacts.js';

test.each([false, true])('real SDK checksum-error deletion is fenced (replacement=%s)', async replaced => {
 const dir = await mkdtemp(join(tmpdir(), 'sdk-artifact-'));
 const requests: { method: string; generation: string | null }[] = [];
 let object: Record<string, unknown> | undefined;
 const server = createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://localhost');
  requests.push({ method: req.method!, generation: url.searchParams.get('ifGenerationMatch') });
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST') {
   const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
   const raw = Buffer.concat(chunks).toString('utf8');
   const start = raw.indexOf('{'), end = raw.indexOf('\r\n--', start);
   const metadata = JSON.parse(raw.slice(start, end));
   object = { ...metadata, name: 'videos/job/lease.mp4', bucket: 'fixture', generation: '123', crc32c: 'AAAAAA==' };
   const response = JSON.stringify(object);
   if (replaced) object = { generation: '456', metadata: { takeoneUploadAttempt: 'another-writer' } };
   res.end(response);
  } else if (req.method === 'GET') {
   if (!object) { res.statusCode = 404; res.end(JSON.stringify({ error: { code: 404, message: 'missing' } })); }
   else res.end(JSON.stringify(object));
  } else if (req.method === 'DELETE') {
   const precondition = url.searchParams.get('ifGenerationMatch');
   if (precondition !== null && precondition !== object?.generation) {
    res.statusCode = 412; res.end(JSON.stringify({ error: { code: 412, message: 'precondition failed' } }));
   } else { object = undefined; res.statusCode = 204; res.end(); }
  } else { res.statusCode = 405; res.end('{}'); }
 });
 try {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const storage = new Storage({ projectId: 'fixture', apiEndpoint: `http://127.0.0.1:${port}`, retryOptions: { autoRetry: false } });
  const path = join(dir, 'input'); await writeFile(path, 'fixture payload requiring correct checksum');
  await expect(uploadArtifacts(storage.bucket('fixture'), [{ key: 'videos/job/lease.mp4', path, contentType: 'video/mp4' }], new AbortController().signal, vi.fn())).rejects.toThrow();
  expect(requests.filter(request => request.method === 'POST')).toEqual([{ method: 'POST', generation: '0' }]);
  expect(requests.filter(request => request.method === 'DELETE')).toEqual(replaced ? [{ method: 'DELETE', generation: '0' }] : [{ method: 'DELETE', generation: '0' }, { method: 'DELETE', generation: '123' }]);
  if (replaced) expect(object?.generation).toBe('456'); else expect(object).toBeUndefined();
 } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
}, 15_000);
