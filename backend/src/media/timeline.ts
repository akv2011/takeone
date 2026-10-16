import type { Op, Word } from '../types.js';

export function seconds(value: string): number {
  const parts = value.split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid timestamp');
  return parts.reduce((total, part) => total * 60 + part, 0);
}

// Words are transcribed on the source. Apply only the timeline edits that precede
// this caption layer so subtitles remain aligned with the rendered speech.
export function wordsAtCaption(words: Word[], precedingOps: Op[]): Word[] {
  let result = words.map(word => ({ ...word }));
  for (const op of precedingOps) {
    if (op.op === 'trim' || op.op === 'clip') {
      const start = seconds(op.start), end = seconds(op.end);
      if (end <= start) throw new Error('Trim end must follow start');
      result = result.filter(word => word.end > start && word.start < end)
        .map(word => ({ ...word, start: Math.max(word.start, start) - start, end: Math.min(word.end, end) - start }));
    } else if (op.op === 'speed') {
      if (!Number.isFinite(op.factor) || op.factor < 0.5 || op.factor > 3) throw new Error('Speed must be between 0.5x and 3x');
      result = result.map(word => ({ ...word, start: word.start / op.factor, end: word.end / op.factor }));
    }
  }
  return result;
}
