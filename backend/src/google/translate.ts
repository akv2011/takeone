// Cloud Translation v3 for caption cues: batched translateText calls that keep each cue's timing.
import { googleJson, PROJECT_ID, requireEnv } from './auth.js';

export interface Cue { start: number; end: number; text: string }

const MAX_STRINGS = 1024;
// 5K is the documented recommended maximum per request; 30K code points is the hard cap.
const MAX_CODE_POINTS = 5000;
const TARGET_LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function batches(cues: readonly Cue[]): Cue[][] {
  const out: Cue[][] = [];
  let batch: Cue[] = [], points = 0;
  for (const cue of cues) {
    const size = [...cue.text].length;
    if (batch.length && (batch.length === MAX_STRINGS || points + size > MAX_CODE_POINTS)) {
      out.push(batch);
      batch = [];
      points = 0;
    }
    batch.push(cue);
    points += size;
  }
  if (batch.length) out.push(batch);
  return out;
}

export async function translateCues(cues: readonly Cue[], targetLanguage: string, signal?: AbortSignal): Promise<Cue[]> {
  const project = requireEnv('TRANSLATE_PROJECT', 'GEMINI_PROJECT');
  if (!PROJECT_ID.test(project)) throw Error('Invalid Cloud Translation configuration');
  if (!TARGET_LANGUAGE.test(targetLanguage)) throw Error('Invalid translation target language');
  const url = `https://translate.googleapis.com/v3/projects/${project}:translateText`;
  const translated: Cue[] = [];
  for (const batch of batches(cues)) {
    const data = await googleJson('Cloud Translation', url, {
      json: { contents: batch.map((cue) => cue.text), mimeType: 'text/plain', targetLanguageCode: targetLanguage },
      signal,
      timeoutMs: 30_000,
    });
    const translations = data?.translations;
    if (!Array.isArray(translations) || translations.length !== batch.length) throw Error('Cloud Translation returned a different number of cues');
    batch.forEach((cue, i) => {
      const text = translations[i]?.translatedText;
      if (typeof text !== 'string' || !text.trim()) throw Error('Cloud Translation returned an empty cue');
      translated.push({ start: cue.start, end: cue.end, text });
    });
  }
  return translated;
}
