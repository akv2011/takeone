import { randomUUID } from 'node:crypto';
import { DEFAULT_LIMITS, type JobSpec, type Op } from '../types.js';

/** Version-one Studio controls. Keep this worker contract aligned with convex/transforms.ts. */
export interface EditTransforms {
  trim?: { start: number; end: number };
  speed?: 0.5 | 1 | 1.5 | 2 | 3;
  aspect?: '9:16' | '1:1' | '16:9';
  fit?: 'crop' | 'fit';
}
export function structuredOps(input: EditTransforms): Op[] {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['trim', 'speed', 'aspect', 'fit'].includes(k))) throw Error('Invalid structured edit');
  const { trim, speed = 1, aspect = '9:16', fit = 'crop' } = input;
  if (trim !== undefined && (!trim || typeof trim !== 'object' || Array.isArray(trim))) throw Error('Invalid structured trim');
  if (![0.5, 1, 1.5, 2, 3].includes(speed) || !['9:16', '1:1', '16:9'].includes(aspect) || !['crop', 'fit'].includes(fit)) throw Error('Invalid structured edit');
  const millis = (n: number) => Number.isFinite(n) && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-7;
  if (trim && (Object.keys(trim).some(k => !['start', 'end'].includes(k)) || !millis(trim.start) || !millis(trim.end) || trim.start < 0 || trim.end <= trim.start || trim.end > 300)) throw Error('Invalid structured trim');
  return [
    ...(trim ? [{ op: 'trim' as const, start: trim.start.toFixed(3), end: trim.end.toFixed(3) }] : []),
    ...(speed !== 1 ? [{ op: 'speed' as const, factor: speed }] : []),
    { op: 'format', aspect, mode: fit },
  ];
}
export function validateStructuredDuration(input: EditTransforms, duration: number) {
  structuredOps(input);
  if (!Number.isFinite(duration) || duration <= 0 || (input.trim && input.trim.end > duration + 0.001)) throw Error('Structured trim exceeds source duration');
  const selected = input.trim ? input.trim.end - input.trim.start : duration;
  if (selected / (input.speed ?? 1) > DEFAULT_LIMITS.maxDurationSec) throw Error('Structured edit exceeds duration limit');
}
export function structuredJob(input: EditTransforms, source: { userId: string; platform: JobSpec['platform']; isPro: boolean; attachmentPath?: string; mode?: JobSpec['mode'] }): JobSpec {
  if (source.mode !== 'edit' || !source.attachmentPath) throw Error('Structured edit requires an uploaded source');
  return { id: randomUUID(), userId: source.userId, platform: source.platform, isPro: source.isPro, mode: 'edit',
    source: { kind: 'upload', path: source.attachmentPath }, transforms: input,
    limits: { ...DEFAULT_LIMITS }, ops: [...structuredOps(input), { op: 'watermark', platform: true, text: 'made with takeone', show: !source.isPro }] };
}
