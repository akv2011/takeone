// Auto-moments: given a bare YouTube link, read the transcript (yt-dlp subs) and have the LLM
// pick the 2-3 most viral 15-30s segments. Used by the gateway when a link arrives with no range.
// yt-dlp gotcha: YouTube 429s subtitle downloads from datacenter IPs when several languages are
// requested back-to-back — so try ONE language at a time (--sleep-subtitles lives in yt-dlp config).
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { BrollSegment, GifOverlay, ZoomWindow } from './types.js';

export interface Moment {
  start: string; end: string; hook: string;
  reframe?: 'crop' | 'fit';        // crop = subject-focused fill, fit = blur-pad (wide shots, on-screen text)
  broll?: BrollSegment[];          // cutaway windows, `at` seconds RELATIVE to the moment start
  gifs?: GifOverlay[];             // reaction sticker windows, relative to the moment start
  zooms?: ZoomWindow[];            // punch-in zoom windows, relative to the moment start
}

// pure: validate one LLM moment -> Moment (broll times converted from absolute video seconds
// to offsets inside the clip; bad entries dropped, hard-clamped later by media-core too)
export function toMoment(x: any, mmssFn: (s: number) => string): Moment | null {
  if (!Number.isFinite(x?.start_sec) || !Number.isFinite(x?.end_sec) || x.end_sec <= x.start_sec) return null;
  const endSec = Math.min(x.end_sec, x.start_sec + 30);
  const broll: BrollSegment[] = (Array.isArray(x.broll) ? x.broll : [])
    .filter((b: any) => Number.isFinite(b?.at_sec) && Number.isFinite(b?.dur_sec) && Array.isArray(b?.keywords) && b.keywords.length)
    .map((b: any) => ({ at: b.at_sec - x.start_sec, dur: b.dur_sec, keywords: b.keywords.map(String).slice(0, 4) }))
    .filter((b: BrollSegment) => b.at >= 0 && b.at < endSec - x.start_sec)
    .slice(0, 2);
  const clipLen = endSec - x.start_sec;
  const rel = (arr: any, mapFn: (b: any) => any) => (Array.isArray(arr) ? arr : [])
    .filter((b: any) => Number.isFinite(b?.at_sec) && Number.isFinite(b?.dur_sec))
    .map(mapFn)
    .filter((b: any) => b.at >= 0 && b.at < clipLen);
  const gifs: GifOverlay[] = rel(x.gifs, (g: any) => ({
    at: g.at_sec - x.start_sec, dur: g.dur_sec, query: String(g.query ?? '').trim(),
  })).filter((g: GifOverlay) => g.query).slice(0, 1);
  const zooms: ZoomWindow[] = rel(x.zooms, (z: any) => ({ at: z.at_sec - x.start_sec, dur: z.dur_sec })).slice(0, 2);
  return {
    start: mmssFn(x.start_sec), end: mmssFn(endSec), hook: String(x.hook ?? ''),
    reframe: x.reframe === 'fit' ? 'fit' : x.reframe === 'crop' ? 'crop' : undefined,
    broll: broll.length ? broll : undefined,
    gifs: gifs.length ? gifs : undefined,
    zooms: zooms.length ? zooms : undefined,
  };
}

const SUB_LANGS = ['en', 'en-orig', 'hi-orig', 'hi'];

export function runYtDlp(args: string[], timeoutMs = 90_000, signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const p = spawn('yt-dlp', args, { stdio: 'ignore', detached: process.platform !== 'win32' });
    const stop = () => {
      try {
        if (p.pid && process.platform !== 'win32') process.kill(-p.pid, 'SIGKILL');
        else p.kill('SIGKILL');
      } catch { p.kill('SIGKILL'); }
    };
    const timer = setTimeout(stop, timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    p.once('error', () => { cleanup(); if (signal?.aborted) reject(signal.reason); else resolve(false); });
    p.once('close', (code) => { cleanup(); if (signal?.aborted) reject(signal.reason); else resolve(code === 0); });
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
  });
}

// vtt -> "123s: line" entries, deduped (auto-subs repeat lines across cues)
export function parseVtt(vtt: string): string[] {
  const lines: string[] = [];
  let last = '';
  for (const block of vtt.split('\n\n')) {
    const m = block.match(/(\d{2}):(\d{2}):(\d{2})\.\d{3} --> /);
    if (!m) continue;
    const sec = +m[1] * 3600 + +m[2] * 60 + +m[3];
    const text = block.split('\n').slice(1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text && text !== last) { lines.push(`${sec}s: ${text}`); last = text; }
  }
  return lines;
}

async function fetchTranscript(url: string, signal?: AbortSignal): Promise<string[] | null> {
  const work = await mkdtemp(join(tmpdir(), 'takeone-subs-'));
  try {
    for (const lang of SUB_LANGS) {
      signal?.throwIfAborted();
      const ok = await runYtDlp(['--write-subs', '--write-auto-subs', '--sub-langs', lang,
        '--skip-download', '--sub-format', 'vtt', '-o', join(work, 'subs'), url], 90_000, signal);
      if (!ok) continue;
      const vtt = (await readdir(work)).find((f) => f.endsWith('.vtt'));
      if (vtt) return parseVtt(await readFile(join(work, vtt), 'utf8'));
    }
    return null;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export async function pickMoments(url: string, count = 3, signal?: AbortSignal): Promise<Moment[]> {
  signal?.throwIfAborted();
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error('LLM_API_KEY not set — auto-moments needs the LLM');
  const lines = await fetchTranscript(url, signal);
  if (!lines?.length) throw new Error('no captions on that video — give me a range like "2:30 to 3:15"');

  const base = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
  const res = await fetch(`${base}/chat/completions`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? 'gpt-5.6-sol',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Timestamped transcript of a YouTube video. Pick the ${count} BEST 15-30 second segments ` +
          `for viral vertical shorts (punchlines, roasts, high-energy or surprising moments). Segments must ` +
          `not overlap.\n` +
          `For each segment also produce a mini edit plan:\n` +
          `- "reframe": "crop" if one person talking is the focus, "fit" if the wide frame matters ` +
          `(on-screen text, gameplay, multiple people spread out).\n` +
          `- "broll": 0-2 cutaway windows where stock footage of what is being SAID would boost retention ` +
          `(never cover the punchline; 2-4s each). Use absolute video seconds and 2-4 concrete stock-search keywords.\n` +
          `- "gifs": 0-1 reaction-sticker moments (a joke landing, a shocking claim) with a short GIPHY ` +
          `search query like "mind blown" or "laughing".\n` +
          `- "zooms": 0-2 punch-in moments on the most emphatic words (1-2s each).\n` +
          `Reply as JSON: {"moments":[{"start_sec":int,"end_sec":int,"hook":"<=6 word overlay",` +
          `"reframe":"crop"|"fit","broll":[{"at_sec":int,"dur_sec":int,"keywords":["..."]}],` +
          `"gifs":[{"at_sec":int,"dur_sec":int,"query":"..."}],"zooms":[{"at_sec":int,"dur_sec":int}]}]}\n\n` +
          lines.join('\n').slice(0, 24_000),
      }],
    }),
  });
  if (!res.ok) throw new Error(`llm ${res.status}`);
  const j = await res.json();
  const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? '{}');
  const moments = (parsed.moments ?? [])
    .map((x: any) => toMoment(x, mmss))
    .filter((m: Moment | null): m is Moment => m !== null)
    .slice(0, count);
  if (!moments.length) throw new Error('could not find good moments — give me a range like "2:30 to 3:15"');
  return moments;
}
