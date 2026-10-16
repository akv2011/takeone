import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';

const ASPECTS = ['9:16', '1:1', '16:9'] as const;
const FITS = ['crop', 'fit'] as const;
const TRANSITION_TYPES = ['cut', 'crossfade', 'fade', 'dip-black'] as const;
const FONTS = ['sans', 'serif', 'mono'] as const;
const WEIGHTS = ['regular', 'bold', 'black'] as const;
const SHADOWS = ['none', 'soft', 'hard'] as const;
const ANIMATIONS = ['none', 'fade', 'rise', 'pop'] as const;

export const timelineSourceValidator = v.union(
  v.object({ kind: v.literal('job'), jobId: v.id('genJobs') }),
  v.object({ kind: v.literal('upload'), uploadId: v.id('uploads') }),
);

export const videoClipValidator = v.object({
  id: v.string(),
  source: timelineSourceValidator,
  sourceStartMs: v.number(),
  sourceEndMs: v.number(),
  timelineStartMs: v.number(),
  fit: v.union(...FITS.map(value => v.literal(value))),
  muted: v.boolean(),
});

export const timelineTransitionValidator = v.object({
  id: v.string(),
  fromClipId: v.string(),
  toClipId: v.string(),
  type: v.union(...TRANSITION_TYPES.map(value => v.literal(value))),
  durationMs: v.number(),
});

export const timelineTextLayerValidator = v.object({
  id: v.string(),
  text: v.string(),
  startMs: v.number(),
  endMs: v.number(),
  x: v.number(),
  y: v.number(),
  scale: v.number(),
  opacity: v.number(),
  font: v.union(...FONTS.map(value => v.literal(value))),
  weight: v.union(...WEIGHTS.map(value => v.literal(value))),
  color: v.string(),
  shadow: v.union(...SHADOWS.map(value => v.literal(value))),
  animation: v.union(...ANIMATIONS.map(value => v.literal(value))),
});

export const timelineDocumentValidator = v.object({
  version: v.literal(1),
  aspect: v.union(...ASPECTS.map(value => v.literal(value))),
  durationMs: v.number(),
  video: v.array(videoClipValidator),
  transitions: v.array(timelineTransitionValidator),
  text: v.array(timelineTextLayerValidator),
  graphics: v.array(timelineTextLayerValidator),
});

export type TimelineSource =
  | { kind: 'job'; jobId: Id<'genJobs'> }
  | { kind: 'upload'; uploadId: Id<'uploads'> };

export type VideoClip = {
  id: string;
  source: TimelineSource;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  fit: (typeof FITS)[number];
  muted: boolean;
};

export type TimelineTransition = {
  id: string;
  fromClipId: string;
  toClipId: string;
  type: (typeof TRANSITION_TYPES)[number];
  durationMs: number;
};

export type TimelineTextLayer = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  font: (typeof FONTS)[number];
  weight: (typeof WEIGHTS)[number];
  color: string;
  shadow: (typeof SHADOWS)[number];
  animation: (typeof ANIMATIONS)[number];
};

export type TimelineDocument = {
  version: 1;
  aspect: (typeof ASPECTS)[number];
  durationMs: number;
  video: VideoClip[];
  transitions: TimelineTransition[];
  text: TimelineTextLayer[];
  graphics: TimelineTextLayer[];
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR_PATTERN = /^#[A-Fa-f0-9]{6}$/;

function invalid(): never {
  throw new ConvexError('INVALID_TIMELINE');
}

function validId(value: string): boolean {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function integerInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function finiteInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function normalizeTextLayer(layer: TimelineTextLayer, durationMs: number): TimelineTextLayer {
  const text = layer.text.trim();
  if (!validId(layer.id) || text.length > 500 ||
    !integerInRange(layer.startMs, 0, durationMs) ||
    !integerInRange(layer.endMs, 0, durationMs) || layer.endMs <= layer.startMs ||
    !finiteInRange(layer.x, 0, 1) || !finiteInRange(layer.y, 0, 1) ||
    !finiteInRange(layer.scale, 0.1, 4) || !finiteInRange(layer.opacity, 0, 1) ||
    !FONTS.includes(layer.font) || !WEIGHTS.includes(layer.weight) || !COLOR_PATTERN.test(layer.color) ||
    !SHADOWS.includes(layer.shadow) || !ANIMATIONS.includes(layer.animation)) invalid();
  return {
    id: layer.id, text, startMs: layer.startMs, endMs: layer.endMs,
    x: layer.x, y: layer.y, scale: layer.scale, opacity: layer.opacity,
    font: layer.font, weight: layer.weight, color: layer.color,
    shadow: layer.shadow, animation: layer.animation,
  };
}

export function normalizeTimeline(timeline: TimelineDocument): TimelineDocument {
  if (timeline.version !== 1 || !ASPECTS.includes(timeline.aspect) ||
    !integerInRange(timeline.durationMs, 100, 300_000) ||
    timeline.video.length < 1 || timeline.video.length > 100 ||
    timeline.transitions.length > 99 || timeline.text.length > 100 || timeline.graphics.length > 100) invalid();

  const video = timeline.video.map((clip): VideoClip => {
    if (!validId(clip.id) || !integerInRange(clip.sourceStartMs, 0, 300_000) ||
      !integerInRange(clip.sourceEndMs, 0, 300_000) || clip.sourceEndMs <= clip.sourceStartMs ||
      !integerInRange(clip.timelineStartMs, 0, timeline.durationMs) ||
      !FITS.includes(clip.fit) || typeof clip.muted !== 'boolean') invalid();

    let source: TimelineSource;
    if (clip.source.kind === 'job' && validId(clip.source.jobId)) {
      source = { kind: 'job', jobId: clip.source.jobId };
    } else if (clip.source.kind === 'upload' && validId(clip.source.uploadId)) {
      source = { kind: 'upload', uploadId: clip.source.uploadId };
    } else {
      invalid();
    }
    return {
      id: clip.id, source, sourceStartMs: clip.sourceStartMs, sourceEndMs: clip.sourceEndMs,
      timelineStartMs: clip.timelineStartMs, fit: clip.fit, muted: clip.muted,
    };
  });

  const adjacentPairs = new Set(video.slice(0, -1).map((clip, index) => `${clip.id}\0${video[index + 1].id}`));
  const transitionPairs = new Set<string>();
  const transitionByPair = new Map<string, TimelineTransition>();
  const transitions = timeline.transitions.map((transition): TimelineTransition => {
    const pair = `${transition.fromClipId}\0${transition.toClipId}`;
    const validDuration = transition.type === 'cut'
      ? transition.durationMs === 0
      : integerInRange(transition.durationMs, 100, 2_000);
    if (!validId(transition.id) || !validId(transition.fromClipId) || !validId(transition.toClipId) ||
      !TRANSITION_TYPES.includes(transition.type) || !validDuration ||
      !adjacentPairs.has(pair) || transitionPairs.has(pair)) invalid();
    transitionPairs.add(pair);
    const normalized = {
      id: transition.id, fromClipId: transition.fromClipId, toClipId: transition.toClipId,
      type: transition.type, durationMs: transition.durationMs,
    };
    transitionByPair.set(pair, normalized);
    return normalized;
  });

  const clipSpans = video.map(clip => clip.sourceEndMs - clip.sourceStartMs);
  const boundaryOverlaps = video.slice(0, -1).map((clip, index) => {
    const transition = transitionByPair.get(`${clip.id}\0${video[index + 1].id}`);
    const overlapMs = transition?.durationMs ?? 0;
    if (overlapMs >= clipSpans[index] || overlapMs >= clipSpans[index + 1]) invalid();
    return overlapMs;
  });
  for (let index = 1; index < video.length - 1; index += 1) {
    if (boundaryOverlaps[index - 1] + boundaryOverlaps[index] >= clipSpans[index]) invalid();
  }

  let timelineEndMs = 0;
  video.forEach((clip, index) => {
    const expectedStartMs = index === 0 ? 0 : timelineEndMs - boundaryOverlaps[index - 1];
    if (clip.timelineStartMs !== expectedStartMs) invalid();
    timelineEndMs = clip.timelineStartMs + clipSpans[index];
    if (timelineEndMs > timeline.durationMs) invalid();
  });
  if (timelineEndMs !== timeline.durationMs) invalid();

  const text = timeline.text.map(layer => normalizeTextLayer(layer, timeline.durationMs));
  const graphics = timeline.graphics.map(layer => normalizeTextLayer(layer, timeline.durationMs));
  const layerIds = [...video, ...transitions, ...text, ...graphics].map(layer => layer.id);
  if (new Set(layerIds).size !== layerIds.length) invalid();

  return {
    version: 1,
    aspect: timeline.aspect,
    durationMs: timeline.durationMs,
    video,
    transitions,
    text,
    graphics,
  };
}
