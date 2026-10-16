import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { renderAssembly } from './assembly.js';
import type { ClaimedJob } from '../managed/worker.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); vi.unstubAllGlobals(); });
const source = { source: { kind: 'job' as const, jobId: 'source1' }, storageKey: 'videos/source1/lease1.mp4', durationMs: 2_000, width: 320, height: 180, hasAudio: true };
const exportSpec: NonNullable<ClaimedJob['timelineExport']> = { profile: { container: 'mp4', fps: 30 }, timeline: {
  version: 1, aspect: '9:16', durationMs: 2_000,
  video: [
    { id: 'a', source: source.source, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 0, fit: 'crop', muted: false },
    { id: 'b', source: source.source, sourceStartMs: 1_000, sourceEndMs: 2_000, timelineStartMs: 1_000, fit: 'fit', muted: true },
  ], transitions: [{ id: 't', fromClipId: 'a', toClipId: 'b', type: 'cut', durationMs: 0 }], text: [], graphics: [],
} };
function deps(bytes = Buffer.from('not-media')) {
  const read = vi.fn(() => Readable.from(bytes));
  return { read, value: { bucket: { file: vi.fn(() => ({ createReadStream: read })) } as any, convexUrl: 'https://example.convex.cloud' } };
}
async function work() { const path = await mkdtemp(join(tmpdir(), 'takeone-assembly-unit-')); dirs.push(path); return path; }

test.each([
  ['profile', { ...exportSpec, profile: { container: 'webm', fps: 30 } }],
  ['clip count', { ...exportSpec, timeline: { ...exportSpec.timeline, video: [exportSpec.timeline.video[0]] } }],
  ['duration', { ...exportSpec, timeline: { ...exportSpec.timeline, durationMs: 1_999 } }],
  ['non-adjacent transition', { ...exportSpec, timeline: { ...exportSpec.timeline, transitions: [{ ...exportSpec.timeline.transitions[0]!, fromClipId: 'b', toClipId: 'a' }] } }],
])('rejects an invalid %s before source access', async (_label, input) => {
  const dir = await work(), dep = deps();
  await expect(renderAssembly(input as any, [source], join(dir, 'out.mp4'), dir, dep.value, new AbortController().signal)).rejects.toThrow();
  expect(dep.read).not.toHaveBeenCalled();
});

test('requires an exact one-to-one descriptor mapping', async () => {
  const dir = await work(), dep = deps();
  await expect(renderAssembly(exportSpec, [], join(dir, 'out.mp4'), dir, dep.value, new AbortController().signal)).rejects.toThrow('mapping');
  await expect(renderAssembly(exportSpec, [source, source], join(dir, 'out.mp4'), dir, dep.value, new AbortController().signal)).rejects.toThrow('mapping');
  const extra = { ...source, source: { kind: 'job' as const, jobId: 'other' }, storageKey: 'videos/other/lease.mp4' };
  await expect(renderAssembly(exportSpec, [extra], join(dir, 'out.mp4'), dir, dep.value, new AbortController().signal)).rejects.toThrow('mapping');
  expect(dep.read).not.toHaveBeenCalled();
});

test('binds a job descriptor storage key to the referenced source job', async () => {
  const dir = await work(), dep = deps();
  await expect(renderAssembly(exportSpec, [{ ...source, storageKey: 'videos/other/lease1.mp4' }], join(dir, 'out.mp4'), dir, dep.value, new AbortController().signal)).rejects.toThrow('descriptor');
  expect(dep.read).not.toHaveBeenCalled();
});

test('rejects overlapping transitions that consume an entire middle clip', async () => {
  const third = { ...exportSpec.timeline.video[1]!, id: 'c', sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 1_000 };
  const timeline = { ...exportSpec.timeline, durationMs: 2_000, video: [
    { ...exportSpec.timeline.video[0]!, sourceEndMs: 1_000 },
    { ...exportSpec.timeline.video[1]!, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 400 }, third,
  ], transitions: [
    { id: 'in', fromClipId: 'a', toClipId: 'b', type: 'fade' as const, durationMs: 600 },
    { id: 'out', fromClipId: 'b', toClipId: 'c', type: 'fade' as const, durationMs: 400 },
  ] };
  const dir = await work(), dep = deps();
  await expect(renderAssembly({ ...exportSpec, timeline }, [source], join(dir, 'out.mp4'), dir, dep.value, new AbortController().signal)).rejects.toThrow('overlap');
  expect(dep.read).not.toHaveBeenCalled();
});

test.each([
  'http://example.convex.cloud/api/storage/id',
  'https://evil.example/api/storage/id',
  'https://example.convex.cloud/other/id',
  'https://example.convex.cloud/api/storage/id?token=leak',
])('rejects unsafe upload URL %s', async storageUrl => {
  const upload = { source: { kind: 'upload' as const, uploadId: 'upload1' }, storageUrl, durationMs: 2_000, width: 320, height: 180, hasAudio: true };
  const timeline = { ...exportSpec.timeline, video: exportSpec.timeline.video.map(clip => ({ ...clip, source: upload.source })) };
  const dir = await work(), dep = deps();
  await expect(renderAssembly({ ...exportSpec, timeline }, [upload], join(dir, 'out.mp4'), dir, dep.value, new AbortController().signal)).rejects.toThrow('URL');
});

test('cancels a rejected upload response body before failing', async () => {
  let cancelled = false;
  const upload = { source: { kind: 'upload' as const, uploadId: 'upload1' }, storageUrl: 'https://example.convex.cloud/api/storage/id', durationMs: 2_000, width: 320, height: 180, hasAudio: true };
  const timeline = { ...exportSpec.timeline, video: exportSpec.timeline.video.map(clip => ({ ...clip, source: upload.source })) };
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 });
  const dir = await work(), bucket = { file: vi.fn() } as any;
  await expect(renderAssembly({ ...exportSpec, timeline }, [upload], join(dir, 'out.mp4'), dir, { bucket, convexUrl: 'https://example.convex.cloud', fetch: async () => response }, new AbortController().signal)).rejects.toThrow('download failed');
  expect(cancelled).toBe(true); expect(bucket.file).not.toHaveBeenCalled();
});

test('enforces the aggregate byte cap while streaming and leaves no output', async () => {
  const dir = await work(), dep = deps(Buffer.alloc(2_048));
  await expect(renderAssembly(exportSpec, [source], join(dir, 'out.mp4'), dir, { ...dep.value, limits: { maxAggregateBytes: 1_024 } }, new AbortController().signal)).rejects.toThrow('size limit');
  await expect(stat(join(dir, 'out.mp4'))).rejects.toThrow();
});

test('cancellation tears down the source stream and leaves no output', async () => {
  const dir = await work(), controller = new AbortController();
  const stream = new Readable({ read() {} });
  const bucket = { file: () => ({ createReadStream: () => stream }) } as any;
  const pending = renderAssembly(exportSpec, [source], join(dir, 'out.mp4'), dir, { bucket, convexUrl: 'https://example.convex.cloud' }, controller.signal);
  setTimeout(() => controller.abort(), 10);
  await expect(pending).rejects.toThrow();
  expect(stream.destroyed).toBe(true);
  await expect(stat(join(dir, 'out.mp4'))).rejects.toThrow();
});
