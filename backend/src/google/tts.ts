// Cloud Text-to-Speech: one synthesize call per narration, written to disk as MP3.
import { writeFile } from 'node:fs/promises';
import { googleJson } from './auth.js';

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
