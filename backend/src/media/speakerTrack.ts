import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ff, ffprobe } from './ffmpeg.js';
import type { JobCtx } from '../types.js';
export type FocusPoint = { at: number; x: number };
export function parseSpeakerTrack(raw: string, times: number[]): FocusPoint[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw Error('Invalid speaker tracking response'); }
  const values = (parsed as { focus_x?: unknown })?.focus_x;
  if (!Array.isArray(values) || values.length !== times.length || values.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1)) throw Error('A single speaker could not be tracked confidently');
  if (values.some((x, i) => i > 0 && Math.abs(x - values[i - 1]) > 0.6)) throw Error('Speaker movement is too ambiguous');
  return times.map((at, i) => ({ at, x: values[i] }));
}
export function trackExpression(points: FocusPoint[]): string {
  if (points.length < 2 || points.length > 30 || points[0].at !== 0 || points.some((p, i) => !Number.isFinite(p.at) || p.at < 0 || p.at > 60 || !Number.isFinite(p.x) || p.x < 0 || p.x > 1 || (i > 0 && p.at <= points[i - 1].at))) throw Error('Invalid speaker track');
  let expression = points.at(-1)!.x.toFixed(6);
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i], b = points[i + 1];
    const segment = `${a.x.toFixed(6)}+(${(b.x - a.x).toFixed(6)})*(t-${a.at.toFixed(6)})/${(b.at - a.at).toFixed(6)}`;
    expression = `if(lt(t,${b.at.toFixed(6)}),${segment},${expression})`;
  }
  return expression;
}
export async function detectSpeakerTrack(input: string, ctx: JobCtx): Promise<FocusPoint[]> {
  ctx.signal?.throwIfAborted();
  const key = process.env.LLM_API_KEY, model = process.env.VISION_MODEL ?? process.env.LLM_MODEL;
  if (!key || !model) throw Error('Follow-speaker requires a configured vision model');
  const meta = await ffprobe(input, ctx.signal);
  if (!meta.hasVideo || meta.durationSec <= 0 || meta.durationSec > 60 || meta.width / meta.height <= 9 / 16 + 0.01) throw Error('Follow-speaker needs a wider video up to 60 seconds');
  const count = Math.min(30, Math.max(2, Math.ceil(meta.durationSec / 2) + 1));
  const times = Array.from({ length: count }, (_, i) => i * Math.max(0.01, meta.durationSec - 0.05) / (count - 1));
  const folder = await mkdtemp(join(ctx.tmpDir, 'speaker-'));
  try {
    const images = [];
    for (const [i, at] of times.entries()) {
      ctx.signal?.throwIfAborted();
      const path = join(folder, `${i}.jpg`);
      await ff(['-ss', at.toFixed(6), '-i', input, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', path], ctx.signal);
      const bytes = await readFile(path, { signal: ctx.signal });
      if (bytes.length > 200 * 1024) throw Error('Speaker frame exceeds size limit');
      images.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}` } });
    }
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
    const response = await fetch(`${process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`, { method: 'POST', signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: `These ${count} chronological frames show one video. Track the SAME clearly visible single talking person's face in each frame. Return JSON {"focus_x":[...]} with exactly ${count} horizontal face centers, normalized 0..1 in image order. Do not infer who is speaking from appearance. If there are multiple possible people, scene cuts, an obscured/missing face or uncertainty, put null for that frame. Do not guess positions.` }, ...images] }] }),
    });
    if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw Error('Speaker tracking provider failed'); }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) throw Error('Speaker response exceeds size limit'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw Error('Speaker tracking response missing');
    ctx.signal?.throwIfAborted();
    return parseSpeakerTrack(content, times);
  } finally { await rm(folder, { recursive: true, force: true }); }
}
export async function renderSpeakerTrack(input: string, output: string, points: FocusPoint[], ctx: JobCtx, height = 1920): Promise<string> {
  const expression = trackExpression(points), meta = await ffprobe(input, ctx.signal);
  if (!meta.hasVideo || meta.durationSec > 60 || meta.width / meta.height <= 9 / 16 + 0.01 || !Number.isInteger(height) || height < 64 || height > 1920 || height % 2) throw Error('Invalid speaker crop source');
  const width = Math.round(height * 9 / 16 / 2) * 2;
  const filter = `scale=-2:${height},crop=${width}:${height}:x='min(max(iw*(${expression})-ow/2,0),iw-ow)':y=0,setsar=1`;
  await ff(['-i', input, '-vf', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(meta.hasAudio ? ['-c:a', 'copy'] : ['-an']), output], ctx.signal);
  return output;
}
