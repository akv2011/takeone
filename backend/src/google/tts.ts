// Cloud Text-to-Speech: synthesize calls written to disk as MP3, one per request-sized piece of a script.
import { writeFile } from 'node:fs/promises';
import { googleJson, requireEnv } from './auth.js';

const MAX_INPUT_BYTES = 5000;
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})+$/;
const VOICE_NAME = /^[a-z]{2,3}-[A-Za-z0-9-]{2,100}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function synthesizeSpeech(
  request: { text: string; languageCode: string; voiceName: string },
  outPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const text = request.text.trim();
  if (!text) throw Error('Narration text is empty');
  // The API limit is in bytes, so Devanagari or CJK narration hits it well before 5000 characters.
  if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) throw Error('Narration text exceeds the Text-to-Speech request limit');
  if (!LANGUAGE_CODE.test(request.languageCode) || !VOICE_NAME.test(request.voiceName)) throw Error('Invalid Text-to-Speech voice');
  const data = await googleJson('Text-to-Speech', 'https://texttospeech.googleapis.com/v1/text:synthesize', {
    json: { input: { text }, voice: { languageCode: request.languageCode, name: request.voiceName }, audioConfig: { audioEncoding: 'MP3' } },
    signal,
    timeoutMs: 45_000,
  });
  const audio = data?.audioContent;
  if (typeof audio !== 'string' || !BASE64.test(audio)) throw Error('Text-to-Speech returned no audio');
  await writeFile(outPath, Buffer.from(audio, 'base64'), { signal });
}

const UNITS = ['sentence', 'word', 'grapheme'] as const;

/** Splits a script into pieces under the request limit: whole sentences, then words for an overlong sentence. */
export function narrationChunks(text: string, maxBytes = MAX_INPUT_BYTES): string[] {
  const chunks: string[] = [];
  let current = '';
  const add = (piece: string, level: number): void => {
    if (Buffer.byteLength(current + piece, 'utf8') <= maxBytes) { current += piece; return; }
    if (current.trim()) chunks.push(current.trim());
    current = '';
    if (Buffer.byteLength(piece, 'utf8') <= maxBytes) { current = piece; return; }
    if (level === UNITS.length - 1) throw Error('Narration text exceeds the Text-to-Speech request limit');
    // Thai has no sentence punctuation, so a long Thai script reaches the dictionary word splitter here.
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: UNITS[level + 1] }).segment(piece)) add(segment, level + 1);
  };
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: UNITS[0] }).segment(text)) add(segment, 0);
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Narrates a script of any length with TTS_VOICE in TTS_LANGUAGE. Returns the MP3 parts in speaking order. */
export async function synthesizeNarration(script: string, outPrefix: string, signal?: AbortSignal): Promise<string[]> {
  const voice = { voiceName: requireEnv('TTS_VOICE'), languageCode: requireEnv('TTS_LANGUAGE') };
  const chunks = narrationChunks(script);
  if (!chunks.length) throw Error('Narration text is empty');
  const parts: string[] = [];
  for (const text of chunks) {
    const part = `${outPrefix}-${parts.length}.mp3`;
    await synthesizeSpeech({ text, ...voice }, part, signal);
    parts.push(part);
  }
  return parts;
}
