// Speech-to-Text v2 BatchRecognize. Sync Recognize caps audio at one minute and batch reads
// only gs:// URIs, so the audio goes through a short-lived Cloud Storage object.
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ff } from '../media/ffmpeg.js';
import { BUCKET_NAME, PROJECT_ID, googleFetch, googleJson, requireEnv } from './auth.js';

const LOCATION = /^[a-z]+(-[a-z]+\d+)?$/;
const MODEL = /^[a-z][a-z0-9_]{1,62}$/;
const MAX_POLLS = 150;
const POLL_MS = 2000;

// Surface only the numeric google.rpc.Status code, never provider text.
const code = (status: any) => (Number.isInteger(status?.code) ? status.code : 'unknown');
// An empty google.rpc.Status, or code 0, means OK.
const failed = (status: any) => !!status && Object.keys(status).length > 0 && status.code !== 0;

/** Transcribes a local media file and returns the raw BatchRecognizeResults (the transcript). */
export async function recognizeSpeech(path: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const project = requireEnv('SPEECH_PROJECT', 'GEMINI_PROJECT');
  const location = requireEnv('SPEECH_LOCATION');
  const model = requireEnv('SPEECH_MODEL');
  const bucket = requireEnv('GCS_BUCKET');
  // These values become URL hosts and paths.
  if (!PROJECT_ID.test(project) || !LOCATION.test(location) || !MODEL.test(model) || !BUCKET_NAME.test(bucket)) throw Error('Invalid Speech-to-Text configuration');
  const host = location === 'global' ? 'speech.googleapis.com' : `${location}-speech.googleapis.com`;
  const object = `speech/${randomUUID()}.flac`;
  const uri = `gs://${bucket}/${object}`;
  const dir = await mkdtemp(join(tmpdir(), 'speech-'));
  let uploadAttempted = false;
  try {
    const audio = join(dir, 'audio.flac');
    // The input can be a full mp4 video. Mono 16 kHz FLAC keeps the upload small and is an auto-detected encoding.
    await ff(['-i', path, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', audio], signal);
    const body = await readFile(audio, { signal });
    uploadAttempted = true;
    await googleFetch('Cloud Storage', `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(object)}`,
      { method: 'POST', body, contentType: 'audio/flac', signal, timeoutMs: 60_000 }).then(response => response.body?.cancel());
    const created = await googleJson('Speech-to-Text', `https://${host}/v2/projects/${project}/locations/${location}/recognizers/_:batchRecognize`, {
      json: {
        config: { autoDecodingConfig: {}, languageCodes: ['auto'], model, features: { enableWordTimeOffsets: true, enableAutomaticPunctuation: true } },
        files: [{ uri }],
        recognitionOutputConfig: { inlineResponseConfig: {} },
      },
      signal, timeoutMs: 30_000,
    });
    // The project segment can come back as a project number.
    const name = created?.name;
    if (typeof name !== 'string' || !new RegExp(`^projects/[a-z0-9-]+/locations/${location}/operations/[A-Za-z0-9_-]+$`).test(name)) throw Error('Speech-to-Text returned an invalid operation');
    let operation: any;
    for (let poll = 0; operation?.done !== true; poll++) {
      if (poll === MAX_POLLS) throw Error('Speech-to-Text is still processing');
      if (poll) await sleep(POLL_MS, undefined, { signal });
      operation = await googleJson('Speech-to-Text', `https://${host}/v2/${name}`, { signal, timeoutMs: 30_000 });
    }
    if (failed(operation.error)) throw Error(`Speech-to-Text failed (${code(operation.error)})`);
    const file = operation.response?.results?.[uri];
    if (!file) throw Error('Speech-to-Text returned no result for the audio');
    if (failed(file.error)) throw Error(`Speech-to-Text failed for the audio (${code(file.error)})`);
    const transcript = file.inlineResult?.transcript;
    if (!transcript || typeof transcript !== 'object') throw Error('Speech-to-Text returned a malformed result');
    return transcript;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    // The delete takes no caller signal so it still runs after an abort.
    // ponytail: best-effort delete; a bucket lifecycle rule on the speech/ prefix is the backstop when it fails.
    if (uploadAttempted) await googleFetch('Cloud Storage', `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}`, { method: 'DELETE', timeoutMs: 10_000 }).catch(() => {});
  }
}
