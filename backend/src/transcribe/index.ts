// B3 — transcribe. Whisper via OpenAI-compatible API (Groq/OpenAI). Returns srt + word timings.
// The verbose_json parser is a pure function (fully unit-tested without a key).
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Transcriber, Word } from '../types.js';
import { wordsToCues, toSrt } from '../media/captions.js';

export class TranscribeError extends Error {}

// pure: OpenAI/Groq whisper verbose_json -> { srt, words }
export function parseWhisper(json: any): { srt: string; words: Word[] } {
  if (!json || typeof json !== 'object') throw new TranscribeError('Invalid transcription response');
  const words: Word[] = [];
  const entries = Array.isArray(json.words) ? json.words : Array.isArray(json.segments) ? json.segments : [];
  if (entries.length > 10000) throw new TranscribeError('Transcription exceeds word limit');
  for (const entry of entries) {
    const text = entry?.word ?? entry?.text;
    const start = entry?.start, end = entry?.end;
    if (typeof text !== 'string' || !text.trim() || text.length > 4000 || typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start < (words.at(-1)?.start ?? 0)) throw new TranscribeError('Invalid transcription timing or text');
    words.push({ text: text.trim(), start, end });
  }
  if (words.some(word => word.start === word.end)) {
    const duration = json.duration;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || !words.some(word => word.end > word.start)) throw new TranscribeError('Invalid transcription timing or text');
    const normalized: Word[] = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.end > word.start) { normalized.push(word); continue; }
      const next = words[i + 1];
      if (next?.start === word.start) {
        const text = `${word.text} ${next.text}`;
        if (text.length > 4000) throw new TranscribeError('Invalid transcription timing or text');
        words[i + 1] = { ...next, text };
        continue;
      }
      // Whisper occasionally assigns recognized words zero duration. Preserve
      // their text without pretending these short caption intervals are exact.
      const end = Math.min(word.start + 0.2, next?.start ?? duration, duration);
      if (end <= word.start) throw new TranscribeError('Invalid transcription timing or text');
      normalized.push({ ...word, end });
    }
    return { srt: toSrt(wordsToCues(normalized, 3)), words: normalized };
  }
  return { srt: toSrt(wordsToCues(words, 3)), words };
}

export const transcriber: Transcriber = {
  async transcribe(path: string, signal?: AbortSignal): Promise<{ srt: string; words: Word[] }> {
    signal?.throwIfAborted();
    const key = process.env.WHISPER_API_KEY;
    const base = process.env.WHISPER_BASE_URL ?? 'https://api.openai.com/v1';
    if (!key) throw new TranscribeError('WHISPER_API_KEY not set (Groq or OpenAI whisper endpoint)');

    const buf = await readFile(path, { signal });
    signal?.throwIfAborted();
    const form = new FormData();
    form.append('file', new Blob([buf]), basename(path));
    form.append('model', process.env.WHISPER_MODEL ?? 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const res = await fetch(`${base}/audio/transcriptions`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000), method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
    if (!res.ok) throw new TranscribeError(`Transcription provider rejected request (${res.status})`);
    const result = await res.json();
    signal?.throwIfAborted();
    return parseWhisper(result);
  },
};
