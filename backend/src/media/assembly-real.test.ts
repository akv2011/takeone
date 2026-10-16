import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ff, ffprobe } from './ffmpeg.js';
import * as ffmpeg from './ffmpeg.js';
import { renderAssembly } from './assembly.js';
import type { ClaimedJob } from '../managed/worker.js';

const exec = promisify(execFile);
let dir: string, red: string, blue: string, longAudio: string, shortAudio: string, cancellationSource: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'takeone-assembly-real-'));
  red = join(dir, 'red.mp4'); blue = join(dir, 'blue.mp4');
  longAudio = join(dir, 'long-audio.mp4'); shortAudio = join(dir, 'short-audio.mp4'); cancellationSource = join(dir, 'cancellation-source.mp4');
  await ff(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=2.2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2.2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', red]);
  await ff(['-f', 'lavfi', '-i', 'color=c=blue:s=180x320:r=24:d=2.2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', blue]);
  await ff(['-f', 'lavfi', '-i', 'color=c=green:s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', longAudio]);
  await ff(['-f', 'lavfi', '-i', 'color=c=yellow:s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=48000:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', shortAudio]);
  await ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=30', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=30', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', cancellationSource]);
}, 30_000);
afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

const jobSource = { kind: 'job' as const, jobId: 'redjob' }, uploadSource = { kind: 'upload' as const, uploadId: 'blueupload' };
function spec(type: 'cut' | 'crossfade' | 'fade' | 'dip-black', overlapMs: number): NonNullable<ClaimedJob['timelineExport']> {
  return { profile: { container: 'mp4', fps: 30 }, timeline: { version: 1, aspect: '9:16', durationMs: 4_000 - overlapMs,
    video: [
      { id: 'red', source: jobSource, sourceStartMs: 0, sourceEndMs: 2_000, timelineStartMs: 0, fit: 'crop', muted: false },
      { id: 'blue', source: uploadSource, sourceStartMs: 0, sourceEndMs: 2_000, timelineStartMs: 2_000 - overlapMs, fit: 'fit', muted: false },
    ], transitions: [{ id: 'transition', fromClipId: 'red', toClipId: 'blue', type, durationMs: overlapMs }], text: [], graphics: [] } };
}
function descriptors() { return [
  { source: jobSource, storageKey: 'videos/redjob/lease.mp4', durationMs: 2_200, width: 320, height: 180, hasAudio: true },
  { source: uploadSource, storageUrl: 'https://example.convex.cloud/api/storage/blue', durationMs: 2_200, width: 180, height: 320, hasAudio: false },
]; }
function deps() {
  const reads = vi.fn(() => createReadStream(red));
  const fetcher = vi.fn(async () => new Response(await readFile(blue)));
  return { reads, fetcher, value: { bucket: { file: () => ({ createReadStream: reads }) } as any, convexUrl: 'https://example.convex.cloud', fetch: fetcher as typeof fetch } };
}
async function pixel(path: string, second: number) {
  const { stdout } = await exec('ffmpeg', ['-loglevel', 'error', '-ss', String(second), '-i', path, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 1024 });
  return [...stdout.subarray(0, 3)];
}
async function meanVolume(path: string, start: number, duration: number) {
  const { stderr } = await exec('ffmpeg', ['-loglevel', 'info', '-ss', String(start), '-t', String(duration), '-i', path, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
  return Number(String(stderr).match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? -Infinity);
}
async function renderWork(name: string) { const path = join(dir, `work-${name}`); await mkdir(path); return path; }

test('renders mixed-dimension sources, transition frames, tones and exact silence into H.264/AAC', async () => {
  const output = join(dir, 'crossfade.mp4'), dep = deps();
  await renderAssembly(spec('crossfade', 500), descriptors(), output, await renderWork('crossfade'), dep.value, new AbortController().signal);
  expect(dep.reads).toHaveBeenCalledOnce(); expect(dep.fetcher).toHaveBeenCalledOnce();
  const meta = await ffprobe(output);
  expect(meta).toMatchObject({ width: 1080, height: 1920, hasVideo: true, hasAudio: true, videoCodec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p' });
  expect(meta.durationSec).toBeCloseTo(3.5, 1);
  const first = await pixel(output, 0.3), transition = await pixel(output, 1.75), last = await pixel(output, 3.1);
  expect(first[0]).toBeGreaterThan(first[2] + 80);
  expect(transition[0]).toBeGreaterThan(20); expect(transition[2]).toBeGreaterThan(20);
  expect(last[2]).toBeGreaterThan(last[0] + 80);
  expect(await meanVolume(output, 0.2, 0.5)).toBeGreaterThan(-40);
  expect(await meanVolume(output, 2.5, 0.5)).toBeLessThan(-80);
  await ff(['-xerror', '-err_detect', 'explode', '-i', output, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
}, 60_000);

test.each([['cut', 0], ['fade', 500], ['dip-black', 500]] as const)('renders the closed %s transition mapping', async (type, overlap) => {
  const output = join(dir, `${type}.mp4`), dep = deps();
  await renderAssembly(spec(type, overlap), descriptors(), output, await renderWork(type), dep.value, new AbortController().signal);
  expect((await ffprobe(output)).durationSec).toBeCloseTo((4_000 - overlap) / 1000, 1);
}, 60_000);

test('renders a createAssembly-style draft with an implicit cut and no transition rows', async () => {
  const output = join(dir, 'implicit-cut.mp4'), dep = deps(), draft = spec('cut', 0);
  draft.timeline.transitions = [];
  await renderAssembly(draft, descriptors(), output, await renderWork('implicit-cut'), dep.value, new AbortController().signal);
  expect((await ffprobe(output)).durationSec).toBeCloseTo(4, 1);
  expect((await pixel(output, 0.5))[0]).toBeGreaterThan(100);
  expect((await pixel(output, 2.5))[2]).toBeGreaterThan(100);
}, 60_000);

test('downloads one source once when multiple clips reuse it', async () => {
  const dep = deps(), output = join(dir, 'duplicate.mp4');
  const one = spec('cut', 0), clips = one.timeline.video.map((clip, index) => ({ ...clip, source: jobSource, sourceStartMs: index * 1_000, sourceEndMs: (index + 1) * 1_000 }));
  clips[1]!.timelineStartMs = 1_000;
  clips[1]!.muted = true;
  const reused = { ...one, timeline: { ...one.timeline, video: clips, durationMs: 2_000 } };
  await renderAssembly(reused, [descriptors()[0]!], output, await renderWork('duplicate'), dep.value, new AbortController().signal);
  expect(dep.reads).toHaveBeenCalledOnce(); expect(dep.fetcher).not.toHaveBeenCalled();
  expect((await ffprobe(output)).durationSec).toBeCloseTo(2, 1);
  expect(await meanVolume(output, 1.25, 0.5)).toBeLessThan(-80);
}, 60_000);

test('chains a hard cut and overlap across three shots without time-base drift', async () => {
  const dep = deps(), output = join(dir, 'three-shot.mp4');
  const timeline: NonNullable<ClaimedJob['timelineExport']> = { profile: { container: 'mp4', fps: 30 }, timeline: {
    version: 1, aspect: '9:16', durationMs: 2_500,
    video: [
      { id: 'one', source: jobSource, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 0, fit: 'crop', muted: false },
      { id: 'two', source: uploadSource, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 1_000, fit: 'fit', muted: false },
      { id: 'three', source: jobSource, sourceStartMs: 1_000, sourceEndMs: 2_000, timelineStartMs: 1_500, fit: 'crop', muted: true },
    ], transitions: [
      { id: 'hard', fromClipId: 'one', toClipId: 'two', type: 'cut', durationMs: 0 },
      { id: 'soft', fromClipId: 'two', toClipId: 'three', type: 'fade', durationMs: 500 },
    ], text: [], graphics: [],
  } };
  await renderAssembly(timeline, descriptors(), output, await renderWork('three-shot'), dep.value, new AbortController().signal);
  expect((await ffprobe(output)).durationSec).toBeCloseTo(2.5, 1);
  expect(dep.reads).toHaveBeenCalledOnce(); expect(dep.fetcher).toHaveBeenCalledOnce();
  await ff(['-xerror', '-err_detect', 'explode', '-i', output, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
}, 60_000);

test('rejects actual source EOF drift before encoding', async () => {
  const dep = deps(), output = join(dir, 'drift.mp4'), claim = spec('cut', 0);
  claim.timeline.video[0]!.sourceEndMs = 2_500; claim.timeline.video[1]!.timelineStartMs = 2_500; claim.timeline.durationMs = 4_500;
  const sources = descriptors(); sources[0]!.durationMs = 3_000;
  await expect(renderAssembly(claim, sources, output, await renderWork('drift'), dep.value, new AbortController().signal)).rejects.toThrow('ended before claimed');
}, 60_000);

function videoBoundarySpec(endMs: number): NonNullable<ClaimedJob['timelineExport']> {
  return { profile: { container: 'mp4', fps: 30 }, timeline: { version: 1, aspect: '9:16', durationMs: endMs,
    video: [
      { id: 'first', source: jobSource, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 0, fit: 'crop', muted: false },
      { id: 'second', source: jobSource, sourceStartMs: 1_000, sourceEndMs: endMs, timelineStartMs: 1_000, fit: 'crop', muted: false },
    ], transitions: [], text: [], graphics: [] } };
}

test('uses video-stream EOF when audio and container duration are longer', async () => {
  const probe = await ffprobe(longAudio);
  expect(probe.durationSec).toBeCloseTo(3, 2); expect(probe.videoDurationSec).toBeCloseTo(2, 2);
  const descriptor = { source: jobSource, storageKey: 'videos/redjob/lease.mp4', durationMs: 3_000, width: 320, height: 180, hasAudio: true };
  const bucket = { file: () => ({ createReadStream: () => createReadStream(longAudio) }) } as any;
  const exactOutput = join(dir, 'video-boundary.mp4');
  await renderAssembly(videoBoundarySpec(2_000), [descriptor], exactOutput, await renderWork('video-boundary'), { bucket, convexUrl: 'https://example.convex.cloud' }, new AbortController().signal);
  expect((await ffprobe(exactOutput)).durationSec).toBeCloseTo(2, 1);
  await expect(renderAssembly(videoBoundarySpec(2_034), [descriptor], join(dir, 'past-video-boundary.mp4'), await renderWork('past-video-boundary'), { bucket, convexUrl: 'https://example.convex.cloud' }, new AbortController().signal)).rejects.toThrow('ended before claimed');
}, 60_000);

test('falls back to format duration when a valid source omits stream duration', async () => {
  const originalProbe = ffprobe;
  const probe = vi.spyOn(ffmpeg, 'ffprobe').mockImplementation(async (path, signal) => {
    const result = await originalProbe(path, signal);
    return { ...result, videoDurationSec: undefined };
  });
  try {
    const output = join(dir, 'duration-fallback.mp4'), dep = deps();
    await renderAssembly(spec('cut', 0), descriptors(), output, await renderWork('duration-fallback'), dep.value, new AbortController().signal);
    expect(probe).toHaveBeenCalled();
    expect((await originalProbe(output)).durationSec).toBeCloseTo(4, 1);
  } finally { probe.mockRestore(); }
}, 60_000);

test('pads short source audio with silence instead of truncating the timeline', async () => {
  const work = await renderWork('short-audio'), output = join(dir, 'short-audio-output.mp4');
  const shortSource = { kind: 'job' as const, jobId: 'shortaudio' };
  const timeline: NonNullable<ClaimedJob['timelineExport']> = { profile: { container: 'mp4', fps: 30 }, timeline: { version: 1, aspect: '9:16', durationMs: 3_000,
    video: [
      { id: 'short', source: shortSource, sourceStartMs: 0, sourceEndMs: 2_000, timelineStartMs: 0, fit: 'crop', muted: false },
      { id: 'silent', source: uploadSource, sourceStartMs: 0, sourceEndMs: 1_000, timelineStartMs: 2_000, fit: 'fit', muted: false },
    ], transitions: [], text: [], graphics: [] } };
  const shortBytes = await readFile(shortAudio), blueBytes = await readFile(blue);
  const sources = [
    { source: shortSource, storageKey: 'videos/shortaudio/lease.mp4', durationMs: 2_000, width: 320, height: 180, hasAudio: true },
    { source: uploadSource, storageUrl: 'https://example.convex.cloud/api/storage/blue', durationMs: 2_200, width: 180, height: 320, hasAudio: false },
  ];
  await renderAssembly(timeline, sources, output, work, { bucket: { file: () => ({ createReadStream: () => Readable.from(shortBytes) }) } as any, convexUrl: 'https://example.convex.cloud', fetch: async () => new Response(blueBytes) }, new AbortController().signal);
  const outputProbe = await ffprobe(output);
  expect(outputProbe.hasAudio).toBe(true); expect(outputProbe.durationSec).toBeCloseTo(3, 1);
  expect(await meanVolume(output, 0.2, 0.5)).toBeGreaterThan(-40);
  expect(await meanVolume(output, 1.25, 0.5)).toBeLessThan(-80);
}, 60_000);

test('aborts promptly during real encoding and removes the partial artifact', async () => {
  const work = await renderWork('encoding-cancel'), output = join(dir, 'encoding-cancel.mp4'), controller = new AbortController();
  const descriptor = { source: jobSource, storageKey: 'videos/redjob/lease.mp4', durationMs: 30_000, width: 320, height: 180, hasAudio: true };
  const timeline: NonNullable<ClaimedJob['timelineExport']> = { profile: { container: 'mp4', fps: 30 }, timeline: { version: 1, aspect: '9:16', durationMs: 30_000,
    video: [
      { id: 'first', source: jobSource, sourceStartMs: 0, sourceEndMs: 15_000, timelineStartMs: 0, fit: 'crop', muted: false },
      { id: 'second', source: jobSource, sourceStartMs: 15_000, sourceEndMs: 30_000, timelineStartMs: 15_000, fit: 'crop', muted: false },
    ], transitions: [], text: [], graphics: [] } };
  const bucket = { file: () => ({ createReadStream: () => createReadStream(cancellationSource) }) } as any;
  let settled = false;
  const pending = renderAssembly(timeline, [descriptor], output, work, { bucket, convexUrl: 'https://example.convex.cloud' }, controller.signal).finally(() => { settled = true; });
  const waitStarted = Date.now();
  while (!(await stat(output).catch(() => null)) && Date.now() - waitStarted < 5_000) await new Promise(resolve => setTimeout(resolve, 5));
  expect(await stat(output).catch(() => null)).not.toBeNull(); expect(settled).toBe(false);
  const abortedAt = Date.now(); controller.abort();
  await expect(pending).rejects.toThrow();
  expect(Date.now() - abortedAt).toBeLessThan(2_000);
  await expect(stat(output)).rejects.toThrow();
  expect((await readdir(work)).some(name => name.startsWith('assembly-source-'))).toBe(true);
}, 60_000);
