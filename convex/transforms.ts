import { v, ConvexError } from 'convex/values';

export const transformsValidator = v.object({
  trim: v.optional(v.object({ start: v.number(), end: v.number() })),
  speed: v.optional(v.union(v.literal(0.5), v.literal(1), v.literal(1.5), v.literal(2), v.literal(3))),
  aspect: v.optional(v.union(v.literal('9:16'), v.literal('1:1'), v.literal('16:9'))),
  fit: v.optional(v.union(v.literal('fit'), v.literal('crop'))),
});
export type EditTransforms = {
  trim?: { start: number; end: number }; speed?: 0.5 | 1 | 1.5 | 2 | 3;
  aspect?: '9:16' | '1:1' | '16:9'; fit?: 'fit' | 'crop';
};
export function normalizeTransforms(input: EditTransforms | undefined, aspect: string, instruction?: string) {
  if (!input) return undefined;
  if (instruction?.trim()) throw new ConvexError('AMBIGUOUS_EDIT');
  const trim = input.trim;
  const millis = (n: number) => Number.isFinite(n) && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-7;
  if (trim && (!millis(trim.start) || !millis(trim.end) || trim.start < 0 || trim.end <= trim.start || trim.end > 300)) throw new ConvexError('INVALID_TRIM');
  const speed = input.speed ?? 1, ratio = input.aspect ?? aspect, fit = input.fit ?? 'crop';
  if (![0.5, 1, 1.5, 2, 3].includes(speed) || !['9:16', '1:1', '16:9'].includes(ratio) || !['fit', 'crop'].includes(fit)) throw new ConvexError('INVALID_TRANSFORMS');
  if (trim && (trim.end - trim.start) / speed > 300) throw new ConvexError('EDIT_TOO_LONG');
  return { ...(trim ? { trim: { start: Math.round(trim.start * 1000) / 1000, end: Math.round(trim.end * 1000) / 1000 } } : {}), speed, aspect: ratio as NonNullable<EditTransforms['aspect']>, fit };
}
