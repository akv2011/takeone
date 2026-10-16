import type { Bucket } from '@google-cloud/storage';
import { createHash } from 'node:crypto';
import { stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { boundedDownload } from '../managed/files.js';
import type { ClaimedJob } from '../managed/worker.js';
import { DEFAULT_LIMITS } from '../types.js';
import { ff, ffprobe } from './ffmpeg.js';

type TimelineExport = NonNullable<ClaimedJob['timelineExport']>;
type AssemblySource = NonNullable<ClaimedJob['assemblySources']>[number];
type SourceRef = AssemblySource['source'];

const CANVAS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] } as const;
const TRANSITIONS = { crossfade: 'dissolve', fade: 'fade', 'dip-black': 'fadeblack' } as const;
export const ASSEMBLY_LIMITS = {
  maxClips: 12,
  maxSources: 8,
  maxSourceBytes: DEFAULT_LIMITS.maxBytes,
  maxAggregateBytes: DEFAULT_LIMITS.maxBytes * 4,
  timeoutMs: DEFAULT_LIMITS.timeoutSec * 1000,
};
// Timeline coordinates are milliseconds while the export is fixed at 30 fps. A clip may
// reach one frame beyond the stream's reported timestamp to absorb container rounding.
const VIDEO_EOF_TOLERANCE_MS = 1000 / 30;

export interface AssemblyDeps {
  bucket: Pick<Bucket, 'file'>;
  convexUrl: string;
  fetch?: typeof fetch;
  limits?: Partial<typeof ASSEMBLY_LIMITS>;
}

const refKey = (source: SourceRef) => source.kind === 'job' ? `job:${source.jobId}` : `upload:${source.uploadId}`;
const validId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validStorageKey = (value: unknown) => typeof value === 'string' && /^videos\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.mp4$/.test(value);
const finiteInt = (value: unknown) => Number.isInteger(value) && Number.isFinite(value);

function validateUrl(raw: string, convexUrl: string): URL {
  let url: URL, deployment: URL;
  try { url = new URL(raw); deployment = new URL(convexUrl); } catch { throw Error('Invalid assembly source URL'); }
  if (url.protocol !== 'https:' || url.origin !== deployment.origin || !url.pathname.startsWith('/api/storage/') || url.username || url.password || url.search || url.hash) {
    throw Error('Invalid assembly source URL');
  }
  return url;
}

function validateSource(source: AssemblySource, convexUrl: string) {
  if (!source || !source.source || !finiteInt(source.durationMs) || source.durationMs < 100 || source.durationMs > 300_000 ||
      !finiteInt(source.width) || source.width < 2 || !finiteInt(source.height) || source.height < 2 || typeof source.hasAudio !== 'boolean') {
    throw Error('Invalid assembly source descriptor');
  }
  if (source.source.kind === 'job') {
    if (!validId(source.source.jobId) || !validStorageKey(source.storageKey) || !source.storageKey!.startsWith(`videos/${source.source.jobId}/`) || source.storageUrl !== undefined) throw Error('Invalid assembly source descriptor');
  } else if (source.source.kind === 'upload') {
    if (!validId(source.source.uploadId) || typeof source.storageUrl !== 'string' || source.storageKey !== undefined) throw Error('Invalid assembly source descriptor');
    validateUrl(source.storageUrl, convexUrl);
  } else throw Error('Invalid assembly source descriptor');
}

function validateClaim(spec: TimelineExport, descriptors: AssemblySource[], convexUrl: string) {
  if (!spec || spec.profile?.container !== 'mp4' || spec.profile?.fps !== 30) throw Error('Invalid assembly render profile');
  const timeline = spec.timeline;
  if (!timeline || timeline.version !== 1 || !['9:16', '1:1', '16:9'].includes(timeline.aspect) || !finiteInt(timeline.durationMs) || timeline.durationMs < 100 || timeline.durationMs > 300_000 ||
      !Array.isArray(timeline.video) || timeline.video.length < 2 || timeline.video.length > ASSEMBLY_LIMITS.maxClips ||
      !Array.isArray(timeline.transitions) || !Array.isArray(timeline.text) || timeline.text.length || !Array.isArray(timeline.graphics) || timeline.graphics.length) {
    throw Error('Invalid assembly timeline');
  }
  const ids = new Set<string>(), sources = new Set<string>();
  for (const clip of timeline.video) {
    if (!clip || !validId(clip.id) || ids.has(clip.id) || !clip.source || !['crop', 'fit'].includes(clip.fit) || typeof clip.muted !== 'boolean' ||
        !finiteInt(clip.sourceStartMs) || !finiteInt(clip.sourceEndMs) || !finiteInt(clip.timelineStartMs) ||
        clip.sourceStartMs < 0 || clip.sourceEndMs <= clip.sourceStartMs || clip.sourceEndMs > 300_000 || clip.timelineStartMs < 0) throw Error('Invalid assembly clip');
    if (clip.source.kind === 'job' ? !validId(clip.source.jobId) : clip.source.kind === 'upload' ? !validId(clip.source.uploadId) : true) throw Error('Invalid assembly clip source');
    ids.add(clip.id); sources.add(refKey(clip.source));
  }
  if (sources.size > ASSEMBLY_LIMITS.maxSources || !Array.isArray(descriptors) || descriptors.length !== sources.size) throw Error('Assembly source mapping mismatch');
  const bySource = new Map<string, AssemblySource>();
  for (const descriptor of descriptors) {
    validateSource(descriptor, convexUrl);
    const key = refKey(descriptor.source);
    if (bySource.has(key) || !sources.has(key)) throw Error('Assembly source mapping mismatch');
    bySource.set(key, descriptor);
  }
  if ([...sources].some(key => !bySource.has(key))) throw Error('Assembly source mapping mismatch');

  const byPair = new Map<string, typeof timeline.transitions[number]>(), transitionIds = new Set<string>();
  const adjacentPairs = new Set(timeline.video.slice(0, -1).map((clip, index) => `${clip.id}:${timeline.video[index + 1]!.id}`));
  for (const transition of timeline.transitions) {
    if (!transition || !validId(transition.id) || transitionIds.has(transition.id) || !ids.has(transition.fromClipId) || !ids.has(transition.toClipId) ||
        !['cut', 'crossfade', 'fade', 'dip-black'].includes(transition.type) || !finiteInt(transition.durationMs) || transition.durationMs < 0) throw Error('Invalid assembly transition');
    const key = `${transition.fromClipId}:${transition.toClipId}`;
    if (byPair.has(key) || !adjacentPairs.has(key)) throw Error('Invalid assembly transition');
    transitionIds.add(transition.id); byPair.set(key, transition);
  }
  const resolvedTransitions = timeline.video.slice(0, -1).map((clip, index) => byPair.get(`${clip.id}:${timeline.video[index + 1]!.id}`) ?? {
    id: `implicit-cut-${index}`, fromClipId: clip.id, toClipId: timeline.video[index + 1]!.id, type: 'cut' as const, durationMs: 0,
  });
  let cursor = 0;
  for (let index = 0; index < timeline.video.length; index++) {
    const clip = timeline.video[index]!;
    const duration = clip.sourceEndMs - clip.sourceStartMs;
    if (clip.timelineStartMs !== cursor) throw Error('Invalid assembly clip timing');
    if (clip.sourceEndMs > bySource.get(refKey(clip.source))!.durationMs) throw Error('Assembly clip exceeds source');
    if (index === timeline.video.length - 1) { cursor += duration; continue; }
    const next = timeline.video[index + 1]!;
    const transition = resolvedTransitions[index]!;
    if (transition.type === 'cut' ? transition.durationMs !== 0 : transition.durationMs < 100 || transition.durationMs >= duration || transition.durationMs >= next.sourceEndMs - next.sourceStartMs) throw Error('Invalid assembly transition duration');
    cursor += duration - transition.durationMs;
  }
  for (let index = 1; index < timeline.video.length - 1; index++) {
    const clip = timeline.video[index]!;
    const incoming = resolvedTransitions[index - 1]!.durationMs;
    const outgoing = resolvedTransitions[index]!.durationMs;
    if (incoming + outgoing >= clip.sourceEndMs - clip.sourceStartMs) throw Error('Invalid assembly transition overlap');
  }
  if (cursor !== timeline.durationMs) throw Error('Invalid assembly duration');
  return { timeline, bySource, resolvedTransitions };
}

function videoFilter(inputIndex: number, clipIndex: number, start: number, end: number, width: number, height: number, fit: 'crop' | 'fit') {
  const scale = fit === 'crop'
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
  return `[${inputIndex}:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=30,settb=AVTB,${scale},setsar=1,format=yuv420p[v${clipIndex}]`;
}

/** Render one immutable, already-authorized project revision into a single normalized MP4. */
export async function renderAssembly(spec: TimelineExport, descriptors: AssemblySource[], output: string, work: string, deps: AssemblyDeps, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const limits = { ...ASSEMBLY_LIMITS, ...deps.limits };
  const { timeline, bySource, resolvedTransitions } = validateClaim(spec, descriptors, deps.convexUrl);
  if (timeline.video.length > limits.maxClips || bySource.size > limits.maxSources) throw Error('Assembly exceeds render limits');
  const timeout = AbortSignal.timeout(limits.timeoutMs), combined = AbortSignal.any([signal, timeout]);
  const files = new Map<string, string>();
  let downloaded = 0;
  try {
    let fileIndex = 0;
    for (const [key, descriptor] of bySource) {
      combined.throwIfAborted();
      const digest = createHash('sha256').update(key).digest('hex').slice(0, 16);
      const path = join(work, `assembly-source-${fileIndex++}-${digest}.mp4`);
      const remaining = limits.maxAggregateBytes - downloaded;
      if (remaining < 1) throw Error('Assembly sources exceed aggregate size limit');
      const cap = Math.min(limits.maxSourceBytes, remaining);
      if (descriptor.source.kind === 'job') {
        await boundedDownload(deps.bucket.file(descriptor.storageKey!).createReadStream(), path, cap, combined);
      } else {
        const url = validateUrl(descriptor.storageUrl!, deps.convexUrl);
        const response = await (deps.fetch ?? fetch)(url, { redirect: 'error', signal: combined });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw Error('Assembly source download failed');
        }
        if (!response.body) throw Error('Assembly source download failed');
        await boundedDownload(Readable.fromWeb(response.body as never), path, cap, combined);
      }
      downloaded += (await stat(path)).size;
      files.set(key, path);
      const actual = await ffprobe(path, combined);
      // Some valid containers omit per-stream duration. Prefer the video stream so longer
      // audio cannot mask EOF, then deliberately fall back to format duration when absent.
      const videoDurationSec = actual.videoDurationSec ?? actual.durationSec;
      if (!actual.hasVideo || actual.width < 2 || actual.height < 2 || !Number.isFinite(videoDurationSec) || videoDurationSec <= 0) throw Error('Invalid assembly source media');
      const neededEnd = Math.max(...timeline.video.filter(clip => refKey(clip.source) === key).map(clip => clip.sourceEndMs));
      if (neededEnd > videoDurationSec * 1000 + VIDEO_EOF_TOLERANCE_MS) throw Error('Assembly source ended before claimed clip');
    }

    const orderedFiles = [...files.values()];
    const inputIndex = new Map(orderedFiles.map((path, index) => [path, index]));
    const graph: string[] = [];
    timeline.video.forEach((clip, index) => {
      const sourcePath = files.get(refKey(clip.source))!;
      const sourceIndex = inputIndex.get(sourcePath)!;
      const start = clip.sourceStartMs / 1000, end = clip.sourceEndMs / 1000, duration = (clip.sourceEndMs - clip.sourceStartMs) / 1000;
      const [width, height] = CANVAS[timeline.aspect];
      graph.push(videoFilter(sourceIndex, index, start, end, width, height, clip.fit));
      const descriptor = bySource.get(refKey(clip.source))!;
      graph.push(!clip.muted && descriptor.hasAudio
        ? `[${sourceIndex}:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS,asettb=1/48000[a${index}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS,asettb=1/48000[a${index}]`);
    });
    let video = 'v0', audio = 'a0', duration = (timeline.video[0]!.sourceEndMs - timeline.video[0]!.sourceStartMs) / 1000;
    for (let index = 1; index < timeline.video.length; index++) {
      const current = timeline.video[index]!;
      const transition = resolvedTransitions[index - 1]!;
      const nextVideo = `vx${index}`, nextAudio = `ax${index}`;
      if (transition.type === 'cut') {
        graph.push(`[${video}][${audio}][v${index}][a${index}]concat=n=2:v=1:a=1[${nextVideo}][${nextAudio}]`);
        duration += (current.sourceEndMs - current.sourceStartMs) / 1000;
      } else {
        const overlap = transition.durationMs / 1000, offset = duration - overlap;
        graph.push(`[${video}][v${index}]xfade=transition=${TRANSITIONS[transition.type]}:duration=${overlap}:offset=${offset}[${nextVideo}]`);
        graph.push(`[${audio}][a${index}]acrossfade=d=${overlap}:c1=tri:c2=tri[${nextAudio}]`);
        duration += (current.sourceEndMs - current.sourceStartMs) / 1000 - overlap;
      }
      video = nextVideo; audio = nextAudio;
    }
    const inputs = orderedFiles.flatMap(path => ['-protocol_whitelist', 'file', '-i', path]);
    await ff([...inputs, '-filter_complex', graph.join(';'), '-map', `[${video}]`, '-map', `[${audio}]`,
      '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest', output], combined);
    combined.throwIfAborted();
    const rendered = await ffprobe(output, combined);
    const renderedDurationSec = rendered.videoDurationSec ?? rendered.durationSec;
    if (!rendered.hasVideo || !rendered.hasAudio || !Number.isFinite(renderedDurationSec) ||
        Math.abs(renderedDurationSec * 1000 - timeline.durationMs) > VIDEO_EOF_TOLERANCE_MS) throw Error('Invalid assembly output duration');
    return output;
  } catch (error) {
    // This layer owns only its partial artifact. runWorker's finally block owns recursive
    // cleanup of the per-job work directory and every downloaded source on all outcomes.
    await rm(output, { force: true }).catch(() => {});
    throw error;
  }
}
