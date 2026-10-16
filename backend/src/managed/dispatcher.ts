import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validId, validVideoKey } from './worker.js';
import { parseFeedbackRequest, type FeedbackRequest, type FeedbackSummary } from './feedback.js';
import type { AnalyticsRows } from '../google/bigquery.js';
export interface DispatcherDeps { secret: string; dispatch(jobId: string): Promise<void>; probeUpload(uploadId: string): Promise<void>; sign(key: string, ttlMs?: number): Promise<string>; summarize(request: FeedbackRequest): Promise<FeedbackSummary>; recordFeedback(row: AnalyticsRows['feedback']): Promise<unknown> }
export function dispatcher(deps: DispatcherDeps) {
  if (!deps.secret) throw Error('DISPATCH_SECRET required');
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, body: object) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/healthz') return reply(200, { ok: true });
    const supplied = Buffer.from(req.headers.authorization ?? ''); const expected = Buffer.from(`Bearer ${deps.secret}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: 'Unauthorized' });
    if (req.method !== 'POST' || !['/dispatch', '/probe-upload', '/sign', '/sign-music', '/sign-captions', '/sign-review', '/sign-cover', '/summarize-feedback'].includes(req.url ?? '')) return reply(404, { error: 'Not found' });
    const feedback = req.url === '/summarize-feedback';
    let body: Record<string, unknown>;
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (feedback ? 655_360 : 8192)) { reply(413, { error: 'Request too large' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      body = JSON.parse(Buffer.concat(chunks).toString());
      if (!body || Array.isArray(body) || typeof body !== 'object' || (!feedback && Object.keys(body).length !== 1)) throw Error();
    } catch { return reply(400, { error: 'Invalid request' }); }
    if (feedback) {
      const request = parseFeedbackRequest(body);
      if (!request) return reply(400, { error: 'Invalid request' });
      let summary: FeedbackSummary;
      try { summary = await deps.summarize(request); } catch { return reply(502, { error: 'Service unavailable' }); }
      try { await deps.recordFeedback({ version_id: request.versionId, note_count: request.notes.length, sentiment: summary.sentiment }); } catch { /* Analytics is best effort; the creator still gets the summary. */ }
      return reply(200, summary);
    }
    const isDispatch = req.url === '/dispatch';
    const isProbe = req.url === '/probe-upload';
    const validKey = req.url === '/sign-cover' ? typeof body.storageKey === 'string' && /^videos\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}-cover\.png$/.test(body.storageKey) : req.url === '/sign-captions' ? typeof body.storageKey === 'string' && /^captions\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.json$/.test(body.storageKey) : req.url === '/sign-music' ? typeof body.storageKey === 'string' && /^music\/[a-zA-Z0-9_-]{1,100}\.(mp3|wav|m4a)$/.test(body.storageKey) : validVideoKey(body.storageKey);
    if (isDispatch ? !validId(body.jobId) : isProbe ? !validId(body.uploadId) : !validKey) return reply(400, { error: 'Invalid request' });
    try {
      if (isDispatch) { await deps.dispatch(body.jobId as string); return reply(202, { accepted: true }); }
      if (isProbe) { await deps.probeUpload(body.uploadId as string); return reply(202, { accepted: true }); }
      return reply(200, { url: await deps.sign(body.storageKey as string, req.url === '/sign-review' ? 120_000 : undefined) });
    } catch { return reply(502, { error: 'Service unavailable' }); }
  };
}
