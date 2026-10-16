// A3 — NL -> JobSpec router. Deterministic rule-based parser (works offline / in tests);
// an LLM can augment when LLM_API_KEY is set. Produces a VALIDATED Op[] — user text never
// becomes a shell string, it only selects from the fixed Op schema.
import { randomUUID } from 'node:crypto';
import type { JobSpec, Op, ChatCtx, Mode } from '../types.js';
import { DEFAULT_LIMITS } from '../types.js';

export class ClarifyError extends Error {}      // ask the user something
export class ImpossibleError extends Error {}   // conflicting request

const YT = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/i;
// Colon timecodes support fractional seconds; legacy dot-only timecodes remain MM.SS.
const TIMECODE = String.raw`(?:\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?|\d{1,2}\.\d{2}(?:\.\d{2})?)`;
const TS = new RegExp(String.raw`(?<![\d:.])(${TIMECODE})(?![\d:.])\s*(?:to|-|–|—|until)\s*(${TIMECODE})(?![\d:.])`, 'i');
const normTs = (t: string) => t.includes(':') ? t : t.replace(/\./g, ':');
export function timestampRange(message: string): { start: string; end: string } | null {
  const match = message.match(TS);
  return match ? { start: normTs(match[1]), end: normTs(match[2]) } : null;
}

function parseOps(msg: string, mode: Mode, isPro: boolean): Op[] {
  const m = msg.toLowerCase();

  // ---- read INTENT first (what the user asked for), then build ----
  const ts = timestampRange(msg);
  const toAudio = /\b(to mp3|as mp3|audio only|extract audio|mp3)\b/.test(m);
  const toGif = /\bto gif|as gif|make a? gif\b/.test(m);
  const toWebm = /\bto webm\b/.test(m);
  const captionsIntent = /\bcaptions?|subtitles?|subs|meme|karaoke\b/.test(m);
  const stickerIntent = /\bsticker\b/.test(m);
  const formatIntent = /\b9:16|vertical|square|1:1|16:9|landscape|reel|short\b/.test(m);
  const explicitSpeed = m.match(/(?:^|\s)([+-]?(?:\d[^\s]*|\.\d+))\s*[x×](?=\s|$|[,.!?])/);
  const speedIntent = /\bspeed|faster|slow/.test(m) || explicitSpeed !== null;

  // impossible: video-only ops requested on an audio-only target
  if (toAudio && (captionsIntent || stickerIntent || formatIntent)) {
    throw new ImpossibleError("can't caption/sticker/format audio — pick an mp3 OR a captioned video, not both");
  }

  const ops: Op[] = [];
  if (ts) ops.push({ op: mode === 'clip' ? 'clip' : 'trim', start: ts.start, end: ts.end });

  // audio target is terminal — return early, no video ops, no watermark
  if (toAudio) { ops.push({ op: 'convert', to: 'mp3' }); return ops; }
  if (toGif) ops.push({ op: 'convert', to: 'gif' });
  else if (toWebm) ops.push({ op: 'convert', to: 'webm' });

  if (speedIntent) {
    if (explicitSpeed && !/^\d+(?:\.\d+)?$/.test(explicitSpeed[1])) throw Error('Invalid speed multiplier');
    const factor = explicitSpeed ? Number(explicitSpeed[1]) : /slow/.test(m) ? 0.5 : 1.5;
    if (!Number.isFinite(factor) || factor < 0.5 || factor > 3) throw Error('Speed must be between 0.5x and 3x');
    ops.push({ op: 'speed', factor });
  }

  // format BEFORE captions: subtitles must render on the final canvas — burning them onto the
  // wide frame first meant the 9:16 crop chopped the text off at the sides
  // NB trailing \b matters: bare /\b1:1|square\b/ matched the "1:1" inside timestamps like "1:15"
  const aspect = /\b(1:1|square)\b/.test(m) ? '1:1' : /\b(16:9|landscape)\b/.test(m) ? '16:9' : '9:16';
  // explicit reframe intent; when absent, prepare() decides (subject-focused crop or blur-pad fit)
  const reframe = /\b(blur|fit|letterbox|no crop|don'?t crop)\b/.test(m) ? 'fit' as const
    : /\b(crop|fill)\b/.test(m) ? 'crop' as const : undefined;
  ops.push({ op: 'format', aspect, ...(reframe ? { mode: reframe } : {}) });

  // captions: explicit intent, OR generate/clip always caption, OR an edit with no other explicit op
  const hasExplicit = captionsIntent || stickerIntent || formatIntent || !!ts || speedIntent || toGif || toWebm;
  if (captionsIntent || mode !== 'edit' || !hasExplicit) {
    const style = /\bmeme\b/.test(m) ? 'meme' : /\bclean\b/.test(m) ? 'clean' : 'karaoke';
    ops.push({ op: 'captions', source: mode === 'generate' ? 'script' : 'whisper', style });
  }

  if (stickerIntent) ops.push({ op: 'sticker' });

  ops.push({ op: 'watermark', platform: true, text: 'made with takeone', show: !isPro });
  return ops;
}

export async function route(message: string, ctx: ChatCtx): Promise<JobSpec> {
  const msg = (message ?? '').trim();
  const base = {
    id: randomUUID().slice(0, 8),
    userId: ctx.userId,
    platform: ctx.platform,
    isPro: ctx.isPro,
    limits: { ...DEFAULT_LIMITS },
  };

  // MODE: clip (YouTube link present)
  const yt = msg.match(YT);
  if (ctx.mode === 'clip' && !yt) throw new ClarifyError('Clip mode needs a YouTube link');
  if (ctx.mode === 'edit' && !ctx.attachmentPath) throw new ClarifyError('Edit mode needs a video');
  if (yt && (!ctx.mode || ctx.mode === 'clip')) {
    const ts = timestampRange(msg);
    if (!ts) throw new ClarifyError('which moment? give me a range like "2:30 to 3:15"');
    // yt-dlp --download-sections already cuts the segment — a second absolute-time trim on the
    // section file would seek past its end and produce an empty stream
    const ops = parseOps(msg, 'clip', ctx.isPro).filter((o) => o.op !== 'clip');
    return { ...base, mode: 'clip',
      source: { kind: 'youtube', url: yt[0], sections: `*${ts.start}-${ts.end}` }, ops };
  }

  // MODE: edit (a file was attached)
  if (ctx.attachmentPath && (!ctx.mode || ctx.mode === 'edit')) {
    return { ...base, mode: 'edit',
      source: { kind: 'upload', path: ctx.attachmentPath }, ops: parseOps(msg || 'caption it', 'edit', ctx.isPro) };
  }

  // MODE: generate (topic only). Guard against vague no-op input.
  const vague = msg.length < 6 || /^(make it better|do something|edit this|help)$/i.test(msg);
  if (vague) throw new ClarifyError('send a clip, a youtube link + timestamp, or tell me a topic for a reel');
  return { ...base, mode: 'generate',
    source: { kind: 'none', topic: msg }, ops: parseOps(msg, 'generate', ctx.isPro) };
}
