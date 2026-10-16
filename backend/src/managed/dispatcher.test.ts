import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { dispatcher } from './dispatcher.js';
import type { FeedbackRequest, FeedbackSummary } from './feedback.js';
const summary: FeedbackSummary = { sentiment: 'mixed', why: 'Strong hook, slow middle', themes: ['Pacing'], notes: [{ id: 'c1', sentiment: 'positive' }, { id: 'c2', sentiment: 'negative' }, { id: 'c3', sentiment: 'mixed' }] };
async function fixture() {
 const dispatch = vi.fn(async (_id: string) => {}); const probeUpload = vi.fn(async (_id: string) => {}); const sign = vi.fn(async (_key: string) => 'https://storage.test/signed');
 const summarize = vi.fn(async (_request: FeedbackRequest) => summary); const recordFeedback = vi.fn(async (_row: unknown) => {});
 const server = createServer(dispatcher({ secret: 'test-secret', dispatch, probeUpload, sign, summarize, recordFeedback })); server.listen(0, '127.0.0.1'); await once(server, 'listening');
 const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
 return { dispatch, probeUpload, sign, summarize, recordFeedback, url, close: () => new Promise<void>((r) => server.close(() => r())) };
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
   expect((await post('/sign-cover', { storageKey: 'videos/job-1/lease-1.mp4' })).status).toBe(400);
   expect((await post('/sign-cover', { storageKey: 'videos/../lease-1-cover.png' })).status).toBe(400);
   expect((await post('/sign-cover', { storageKey: 'captions/job-1/lease-1-cover.png' })).status).toBe(400);
   expect((await post('/sign', { storageKey: 'videos/job-1/lease-1-cover.png' })).status).toBe(400);
   expect(await (await post('/sign-cover', { storageKey: 'videos/job-1/lease-1-cover.png' })).json()).toEqual({ url: 'https://storage.test/signed' });
   expect(f.sign).toHaveBeenLastCalledWith('videos/job-1/lease-1-cover.png', undefined);
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
 it('summarizes feedback through a strict route with its own body limit', async () => {
  const f = await fixture(); try {
   const note = (id: string, at: number, text: string) => ({ id, at, text });
   const valid = { versionId: 'job-1', notes: [note('c1', 0, ' Love the hook\tand\nthe ending '), note('c2', 2.875, 'x'.repeat(1000)), note('c3', 301, 'Slow middle')] };
   const withNote = (change: Record<string, unknown>) => ({ ...valid, notes: [valid.notes[0], valid.notes[1], { ...valid.notes[2], ...change }] });
   const post = (path: string, body: string) => fetch(f.url + path, { method: 'POST', headers: { authorization: 'Bearer test-secret' }, body });
   const padded = (bytes: number) => `{"pad":"${'a'.repeat(bytes - 10)}"}`;
   expect((await fetch(f.url + '/summarize-feedback', { method: 'POST', body: JSON.stringify(valid) })).status).toBe(401);
   expect((await post('/summarize-feedback', padded(655_361))).status).toBe(413);
   expect((await post('/summarize-feedback', padded(655_360))).status).toBe(400);
   expect((await post('/dispatch', padded(9_000))).status).toBe(413);
   const invalid: Array<[string, unknown]> = [
    ['an array body', [valid]],
    ['an extra top-level key', { ...valid, extra: 1 }],
    ['a missing notes key', { versionId: 'job-1' }],
    ['a bad versionId', { ...valid, versionId: '../job' }],
    ['notes that are not an array', { ...valid, notes: {} }],
    ['2 notes', { ...valid, notes: valid.notes.slice(0, 2) }],
    ['201 notes', { ...valid, notes: Array.from({ length: 201 }, (_, i) => note(`n${i}`, 1, 'ok')) }],
    ['a duplicate note id', withNote({ id: 'c1' })],
    ['a bad note id', withNote({ id: 'c 3' })],
    ['a null note', { ...valid, notes: [...valid.notes.slice(0, 2), null] }],
    ['an extra note key', withNote({ author: 'Reviewer' })],
    ['a missing note key', { ...valid, notes: [valid.notes[0], valid.notes[1], { id: 'c3', at: 1 }] }],
    ['a negative at', withNote({ at: -0.001 })],
    ['an at past 301', withNote({ at: 301.001 })],
    ['a string at', withNote({ at: '2' })],
    ['an empty text', withNote({ text: '  \n ' })],
    ['a 1001-character text', withNote({ text: 'x'.repeat(1001) })],
    ['a non-string text', withNote({ text: 5 })],
    ['a control character', withNote({ text: 'bell\u0007here' })],
    ['a carriage return', withNote({ text: 'one\rtwo' })],
   ];
   for (const [label, body] of invalid) {
    const response = await post('/summarize-feedback', JSON.stringify(body));
    expect(response.status, label).toBe(400); expect(await response.json(), label).toEqual({ error: 'Invalid request' });
   }
   expect(f.summarize).not.toHaveBeenCalled();
   const ok = await post('/summarize-feedback', JSON.stringify(valid));
   expect(ok.status).toBe(200); expect(await ok.json()).toEqual(summary);
   expect(f.summarize).toHaveBeenCalledWith({ versionId: 'job-1', notes: [note('c1', 0, 'Love the hook\tand\nthe ending'), valid.notes[1], valid.notes[2]] });
   expect(f.recordFeedback).toHaveBeenCalledWith({ version_id: 'job-1', note_count: 3, sentiment: 'mixed' });
   f.recordFeedback.mockRejectedValueOnce(Error('BigQuery down'));
   const unrecorded = await post('/summarize-feedback', JSON.stringify(valid));
   expect(unrecorded.status).toBe(200); expect(await unrecorded.json()).toEqual(summary);
   expect(f.recordFeedback).toHaveBeenCalledTimes(2);
   f.summarize.mockRejectedValueOnce(Error('Gemini rejected the request (403) provider-detail'));
   const failed = await post('/summarize-feedback', JSON.stringify(valid));
   expect(failed.status).toBe(502); expect(await failed.text()).toBe('{"error":"Service unavailable"}');
   expect(f.recordFeedback).toHaveBeenCalledTimes(2);
   const most = await post('/summarize-feedback', JSON.stringify({ versionId: 'job-1', notes: Array.from({ length: 200 }, (_, i) => note(`n${i}`, 1, 'ok')) }));
   expect(most.status).toBe(200);
   expect((await post('/summarize-feedback', JSON.stringify(withNote({ text: 'next\u0085line\u009f' })))).status, 'Convex stores C1 controls').toBe(200);
  } finally { await f.close(); }
 });
});
