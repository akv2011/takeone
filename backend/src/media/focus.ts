// Smart-crop focus detection: sample 3 frames, ask a vision LLM where the subject is.
// Returns the horizontal subject center as 0-1, or null when unsure / offline / disabled —
// null tells the caller to use the safe blur-pad `fit` instead of a blind crop.
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ff, ffprobe } from './ffmpeg.js';
import type { JobCtx } from '../types.js';

// pure: validate + clamp an LLM focus reply. Only trusts a clearly-usable answer.
export function parseFocus(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw.replace(/^```json?|```$/g, '').trim());
    const x = j.focus_x;
    if (typeof x !== 'number' || !Number.isFinite(x)) return null;
    return Math.min(1, Math.max(0, x));
  } catch { return null; }
}

export async function detectFocusX(input: string, ctx: JobCtx): Promise<number | null> {
  if (process.env.SMART_CROP === '0') return null;
  const key = process.env.LLM_API_KEY;
  if (!key) return null;

  const frames: string[] = [];
  try {
    const dur = (await ffprobe(input)).durationSec || 10;
    for (const [i, frac] of [0.15, 0.5, 0.85].entries()) {
      const p = join(ctx.tmpDir, `focus-${i}.jpg`);
      await ff(['-ss', (dur * frac).toFixed(2), '-i', input, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', p], ctx.signal);
      frames.push(p);
    }
    const images = await Promise.all(frames.map(async (p) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${(await readFile(p)).toString('base64')}` },
    })));

    const base = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: process.env.VISION_MODEL ?? process.env.LLM_MODEL ?? 'gpt-5.6-sol',
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text:
              'These are 3 frames from one video clip that will be center-cropped to a vertical 9:16 reel. ' +
              'Find the main subject (usually the speaking person\'s face). Reply as JSON {"focus_x": <0-1>} ' +
              'where focus_x is the horizontal center of the subject (0=left edge, 1=right edge). ' +
              'If the subject moves a lot between frames, there are multiple important subjects spread wide, ' +
              'or you are unsure, reply {"focus_x": null}.' },
            ...images,
          ],
        }],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return parseFocus(j.choices?.[0]?.message?.content ?? null);
  } catch {
    return null;   // any failure -> caller uses blur-pad fit
  } finally {
    await Promise.all(frames.map((p) => rm(p, { force: true }).catch(() => {})));
  }
}
