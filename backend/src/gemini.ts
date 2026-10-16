// One Gemini client for the worker: Vertex AI generateContent over the shared Google REST helper,
// JSON output constrained by responseSchema, then the caller's own strict validator, or a plain-text
// answer grounded with Google Search. The search tool goes without responseSchema because Vertex AI
// does not document that pairing, and the Gemini API lists it as a Gemini 3 preview only.
import { googleFetch, PROJECT_ID } from './google/auth.js';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: 'image/jpeg' | 'image/png'; data: string } }
  | { fileData: { mimeType: 'video/mp4'; fileUri: `gs://${string}` } };

export interface GenerateJsonRequest<T> {
  parts: GeminiPart[];
  /** Vertex AI OpenAPI-subset schema passed as generationConfig.responseSchema. */
  schema: Record<string, unknown>;
  system?: string;
  signal?: AbortSignal;
  timeoutMs: number;
  /** The caller's strict validator. Its errors reach the caller unchanged. */
  parse(value: unknown): T;
}

const MAX_RESPONSE_BYTES = 1024 * 1024;

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_PROJECT?.trim() && !!process.env.GEMINI_MODEL?.trim();
}

function endpoint(): string {
  const project = process.env.GEMINI_PROJECT?.trim(), model = process.env.GEMINI_MODEL?.trim();
  const location = process.env.GEMINI_LOCATION?.trim() || 'global';
  if (!project) throw Error('GEMINI_PROJECT is required for Gemini');
  if (!model) throw Error('GEMINI_MODEL is required for Gemini');
  if (!PROJECT_ID.test(project) || !/^gemini-[a-z0-9.-]+$/.test(model) ||
      !(location === 'global' || /^[a-z]+-[a-z]+\d$/.test(location))) throw Error('Invalid Gemini configuration');
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) throw Error('Gemini response exceeds size limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

async function generate(body: object, signal: AbortSignal | undefined, timeoutMs: number): Promise<{ text: string; candidate: any }> {
  signal?.throwIfAborted();
  const response = await googleFetch('Gemini', endpoint(), { json: body, signal, timeoutMs });
  const raw = await readCapped(response).catch((error) => { signal?.throwIfAborted(); throw error; });
  let data: any;
  try { data = JSON.parse(raw); } catch { throw Error('Gemini provider returned a malformed response'); }
  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) throw Error(`Gemini blocked the prompt (${blocked})`);
  const candidate = data?.candidates?.[0];
  if (!candidate) throw Error('Gemini returned no candidates');
  if (candidate.finishReason && candidate.finishReason !== 'STOP') throw Error(`Gemini stopped without a usable answer (${candidate.finishReason})`);
  const parts: unknown[] = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  const text = parts.filter((p: any) => typeof p?.text === 'string' && !p.thought).map((p: any) => p.text).join('');
  if (!text.trim()) throw Error('Gemini returned an empty answer');
  return { text, candidate };
}

const systemInstruction = (system?: string) => system ? { systemInstruction: { parts: [{ text: system }] } } : {};

export async function generateJson<T>(request: GenerateJsonRequest<T>): Promise<T> {
  const { text } = await generate({
    contents: [{ role: 'user', parts: request.parts }],
    ...systemInstruction(request.system),
    generationConfig: { responseMimeType: 'application/json', responseSchema: request.schema },
  }, request.signal, request.timeoutMs);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw Error('Gemini returned invalid JSON'); }
  return request.parse(value);
}

/** Plain-text answer grounded with Google Search. The caller reads sources from groundingMetadata, never from the text. */
export async function generateGrounded(request: { prompt: string; system?: string; signal?: AbortSignal; timeoutMs: number }): Promise<{ text: string; grounding: unknown }> {
  const { text, candidate } = await generate({
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    ...systemInstruction(request.system),
    tools: [{ googleSearch: {} }],
  }, request.signal, request.timeoutMs);
  return { text, grounding: candidate.groundingMetadata };
}
