import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CloudRunIdentity } from './cloudRun.js';
import { validId } from './worker.js';
export function workerHandler(run: (identity: CloudRunIdentity) => Promise<string>) {
  let busy = false;
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, body: object) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.url === '/healthz') return req.method === 'GET' ? reply(200, { ok: true }) : reply(405, { error: 'Method not allowed' });
    if (req.url !== '/run') return reply(404, { error: 'Not found' });
    if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
    if (busy) return reply(429, { error: 'Busy' });
    busy = true;
    try {
      let identity: CloudRunIdentity;
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024) throw Error();
          chunks.push(Buffer.from(chunk));
        }
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
        const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
        const value = keys.length === 1 ? (body as Record<string, unknown>)[keys[0]] : undefined;
        if ((keys[0] !== 'jobId' && keys[0] !== 'uploadId') || !validId(value)) throw Error();
        identity = keys[0] === 'jobId' ? { jobId: value } : { uploadId: value };
      } catch { return reply(400, { error: 'Invalid request' }); }
      try {
        const outcome = await run(identity);
        console.log(outcome);
        reply(200, { outcome });
      } catch { console.error('worker_failed'); reply(500, { error: 'Run failed' }); }
    } finally { busy = false; }
  };
}
