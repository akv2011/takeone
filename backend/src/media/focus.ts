// Smart-crop focus detection: sample 3 frames, ask Gemini where the subject is.
// Returns the horizontal subject center as 0-1, or null when unsure, offline or disabled.
// null tells the caller to use the safe blur-pad `fit` instead of a blind crop.
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ff, ffprobe } from './ffmpeg.js';
import { generateJson, geminiConfigured } from '../gemini.js';
import type { JobCtx } from '../types.js';

// pure: validate + clamp a model focus reply. Only trusts a clearly-usable answer.
export function parseFocus(value: unknown): number | null {
  const x = (value as { focus_x?: unknown } | null)?.focus_x;
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  return Math.min(1, Math.max(0, x));
}

export async function detectFocusX(input: string, ctx: JobCtx): Promise<number | null> {
  if (process.env.SMART_CROP === '0') return null;
  if (!geminiConfigured()) return null;

  const frames: string[] = [];
  try {
    const dur = (await ffprobe(input)).durationSec || 10;
    for (const [i, frac] of [0.15, 0.5, 0.85].entries()) {
      const p = join(ctx.tmpDir, `focus-${i}.jpg`);
      await ff(['-ss', (dur * frac).toFixed(2), '-i', input, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', p], ctx.signal);
      frames.push(p);
    }
    const images = await Promise.all(frames.map(async (p) => ({
      inlineData: { mimeType: 'image/jpeg' as const, data: (await readFile(p)).toString('base64') },
    })));
    return await generateJson({
      signal: ctx.signal, timeoutMs: 25_000, parse: parseFocus,
      schema: { type: 'object', properties: { focus_x: { type: 'number', nullable: true, minimum: 0, maximum: 1 } }, required: ['focus_x'] },
      parts: [
        { text:
          'These are 3 frames from one video clip that will be center-cropped to a vertical 9:16 reel. ' +
          'Find the main subject (usually the speaking person\'s face). Reply as JSON {"focus_x": <0-1>} ' +
          'where focus_x is the horizontal center of the subject (0=left edge, 1=right edge). ' +
          'If the subject moves a lot between frames, there are multiple important subjects spread wide, ' +
          'or you are unsure, reply {"focus_x": null}.' },
        ...images,
      ],
    });
  } catch {
    return null;   // any failure -> caller uses blur-pad fit
  } finally {
    await Promise.all(frames.map((p) => rm(p, { force: true }).catch(() => {})));
  }
}
