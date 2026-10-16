// 9:16 cover art from a Gemini image model over Vertex AI generateContent, because Imagen on Vertex AI is retired.
import { writeFile } from 'node:fs/promises';
import { googleJson, PROJECT_ID, requireEnv } from './auth.js';

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function endpoint(): string {
  const model = requireEnv('IMAGE_MODEL');
  const project = requireEnv('IMAGE_PROJECT', 'GEMINI_PROJECT');
  const location = process.env.IMAGE_LOCATION?.trim() || 'global';
  if (!/^gemini-[a-z0-9.-]+$/.test(model) || !PROJECT_ID.test(project) ||
      !(location === 'global' || /^[a-z]+-[a-z]+\d$/.test(location))) throw Error('Invalid image generation configuration');
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

export async function generateCoverImage(prompt: string, outPath: string, signal?: AbortSignal): Promise<void> {
  const url = endpoint();
  const text = prompt.trim();
  if (text.length < 6 || text.length > 4000) throw Error('Invalid cover image prompt');
  const data = await googleJson('Gemini image', url, {
    json: {
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '9:16', imageOutputOptions: { mimeType: 'image/png' } },
        candidateCount: 1,
      },
    },
    signal,
    timeoutMs: 120_000,
  });
  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) throw Error(`Gemini image blocked the prompt (${blocked})`);
  const parts: unknown[] = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
  const image = parts.find((part: any) =>
    part?.inlineData?.mimeType === 'image/png' && typeof part.inlineData.data === 'string' && BASE64.test(part.inlineData.data)) as
    { inlineData: { data: string } } | undefined;
  if (!image) throw Error('Gemini image returned no PNG');
  const bytes = Buffer.from(image.inlineData.data, 'base64');
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    throw Error('Gemini image returned no PNG');
  }
  // The aspect setting is reported to be ignored at times, so check the pixels rather than trust the request.
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!(Math.abs(width / height - 9 / 16) <= 0.02)) throw Error('Gemini image did not return a 9:16 image');
  await writeFile(outPath, bytes, { signal });
}
