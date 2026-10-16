export type TimelineSource = { kind: 'job'; jobId: string } | { kind: 'upload'; uploadId: string };
export type SourceOption = { source: TimelineSource; label: string; durationMs: number; width: number; height: number; hasAudio: boolean };
export type Clip = { id: string; source: TimelineSource; sourceStartMs: number; sourceEndMs: number; timelineStartMs: number; fit: 'crop' | 'fit'; muted: boolean };
export type Transition = { id: string; fromClipId: string; toClipId: string; type: 'cut' | 'crossfade' | 'fade' | 'dip-black'; durationMs: number };
export type Timeline = { version: 1; aspect: '9:16' | '1:1' | '16:9'; durationMs: number; video: Clip[]; transitions: Transition[]; text: any[]; graphics: any[] };

export const sourceKey = (source: TimelineSource) => source.kind === 'job' ? `job:${source.jobId}` : `upload:${source.uploadId}`;

function availableTransitionDuration(left: Clip, right: Clip) {
  return Math.max(0, Math.min(2_000, left.sourceEndMs - left.sourceStartMs - 1, right.sourceEndMs - right.sourceStartMs - 1));
}

export function recalculateTimeline(input: Timeline): Timeline {
  const adjacent = new Set(input.video.slice(0, -1).map((clip, index) => `${clip.id}\0${input.video[index + 1].id}`));
  const transitions = input.transitions.filter(t => adjacent.has(`${t.fromClipId}\0${t.toClipId}`)).map(t => {
    const left = input.video.find(c => c.id === t.fromClipId)!;
    const right = input.video.find(c => c.id === t.toClipId)!;
    const maximum = availableTransitionDuration(left, right);
    return t.type === 'cut' || maximum < 100 ? { ...t, type: 'cut' as const, durationMs: 0 } : { ...t, durationMs: Math.min(t.durationMs, maximum) };
  });
  // A middle clip must retain at least one frame after its incoming and outgoing overlaps.
  for (let index = 1; index < input.video.length - 1; index += 1) {
    const incoming = transitions.find(t => t.fromClipId === input.video[index - 1].id && t.toClipId === input.video[index].id);
    const outgoing = transitions.find(t => t.fromClipId === input.video[index].id && t.toClipId === input.video[index + 1].id);
    const span = input.video[index].sourceEndMs - input.video[index].sourceStartMs;
    if (incoming && outgoing && incoming.durationMs + outgoing.durationMs >= span) outgoing.durationMs = Math.max(0, span - incoming.durationMs - 1);
    if (outgoing && outgoing.durationMs < 100) { outgoing.type = 'cut'; outgoing.durationMs = 0; }
  }
  let end = 0;
  const video = input.video.map((clip, index) => {
    const previous = index ? input.video[index - 1] : undefined;
    const transition = previous ? transitions.find(t => t.fromClipId === previous.id && t.toClipId === clip.id) : undefined;
    const timelineStartMs = index === 0 ? 0 : end - (transition?.durationMs ?? 0);
    end = timelineStartMs + clip.sourceEndMs - clip.sourceStartMs;
    return { ...clip, timelineStartMs };
  });
  return { ...input, video, transitions, durationMs: end };
}

export function uniqueId(timeline: Timeline, prefix: string) {
  const used = new Set([...timeline.video, ...timeline.transitions].map(item => item.id));
  let index = 1;
  while (used.has(`${prefix}-${String(index).padStart(3, '0')}`)) index += 1;
  return `${prefix}-${String(index).padStart(3, '0')}`;
}
