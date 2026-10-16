// B3 transcribe. Speech-to-Text v2 (BatchRecognize) returns word timings; parseSpeech is the
// pure, strict adapter from its results to { srt, words }.
import type { Transcriber, Word } from '../types.js';
import { wordsToCues, toSrt } from '../media/captions.js';
import { recognizeSpeech } from '../google/speech.js';

export class TranscribeError extends Error {}

const invalidWord = () => new TranscribeError('Invalid transcription timing or text');

// proto Duration JSON such as "3.5s". Anything else is NaN so the finite checks reject it.
function seconds(value: unknown): number {
  return typeof value === 'string' && /^\d+(\.\d{1,9})?s$/.test(value) ? Number(value.slice(0, -1)) : NaN;
}

// pure: BatchRecognizeResults -> { srt, words }
export function parseSpeech(json: unknown): { srt: string; words: Word[] } {
  if (!json || typeof json !== 'object') throw new TranscribeError('Invalid transcription response');
  const { results = [] } = json as { results?: unknown };
  if (!Array.isArray(results)) throw new TranscribeError('Invalid transcription response');
  const words: Word[] = [];
  let duration: number | undefined;
  for (const result of results) {
    if (!result || typeof result !== 'object' || (result.alternatives !== undefined && !Array.isArray(result.alternatives))) throw new TranscribeError('Invalid transcription response');
    const resultEnd = seconds(result.resultEndOffset);
    if (Number.isFinite(resultEnd)) duration = Math.max(duration ?? 0, resultEnd);
    const alternative = result.alternatives?.[0];
    if (!alternative) continue;
    const entries = alternative.words ?? [];
    if (!Array.isArray(entries)) throw new TranscribeError('Invalid transcription response');
    if (!entries.length && typeof alternative.transcript === 'string' && alternative.transcript.trim()) throw new TranscribeError('Transcription is missing word timings');
    if (words.length + entries.length > 10000) throw new TranscribeError('Transcription exceeds word limit');
    for (const entry of entries) {
      const text = entry?.word;
      // proto3 JSON can omit a zero duration. The chronological check still rejects a missing start after a later word.
      const start = entry?.startOffset === undefined ? 0 : seconds(entry.startOffset);
      const end = seconds(entry?.endOffset);
      if (typeof text !== 'string' || !text.trim() || text.length > 4000 || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start < (words.at(-1)?.start ?? 0)) throw invalidWord();
      words.push({ text: text.trim(), start, end });
    }
  }
  if (!words.some(word => word.start === word.end)) return { srt: toSrt(wordsToCues(words, 3)), words };
  if (duration === undefined || duration <= 0 || !words.some(word => word.end > word.start)) throw invalidWord();
  const repaired: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.end > word.start) { repaired.push(word); continue; }
    const next = words[i + 1];
    if (next?.start === word.start) {
      const text = `${word.text} ${next.text}`;
      if (text.length > 4000) throw invalidWord();
      words[i + 1] = { ...next, text };
      continue;
    }
    // A recognized word can come back with zero duration. Keep its text with a short bounded
    // display interval instead of pretending the timing is exact.
    const end = Math.min(word.start + 0.2, next?.start ?? duration, duration);
    if (end <= word.start) throw invalidWord();
    repaired.push({ ...word, end });
  }
  return { srt: toSrt(wordsToCues(repaired, 3)), words: repaired };
}

export const transcriber: Transcriber = {
  async transcribe(path, signal) {
    return parseSpeech(await recognizeSpeech(path, signal));
  },
};
