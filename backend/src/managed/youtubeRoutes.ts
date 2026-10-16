// The YouTube moment routes, in front of the dispatcher. Every other path reaches the dispatcher untouched.
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dispatcher, type DispatcherDeps } from './dispatcher.js';
import { findYouTubeMoments, MOMENT_LIMITS, VIDEO_ID, type Moment } from '../youtubeMoments.js';
import { translateCues } from '../google/translate.js';
import { CAPTION_LANGUAGES, isCaptionLanguage, type CaptionLanguage } from '../languages.js';

export interface YouTubeRouteDeps {
  findMoments(videoId: string): Promise<Moment[]>;
  translate(texts: string[], language: CaptionLanguage): Promise<string[]>;
}

export async function translateTexts(texts: string[], language: CaptionLanguage): Promise<string[]> {
  const cues = await translateCues(texts.map(text => ({ start: 0, end: 0, text })), CAPTION_LANGUAGES[language].translate);
  return cues.map(cue => cue.text);
}

const CONTROL = /\p{Cc}/u;
const hasExactly = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function cueTexts(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MOMENT_LIMITS.cues) return null;
  const texts = value.map(text => typeof text === 'string' && !CONTROL.test(text) ? text.trim() : '');
  return texts.every(text => text.length >= 1 && text.length <= MOMENT_LIMITS.cueChars) ? texts : null;
}

/** Each route validates its body into the work to run, or null for a 400. */
interface Route { limit: number; parse(body: unknown, youtube: YouTubeRouteDeps): (() => Promise<object>) | null }
const ROUTES = new Map<string, Route>([
  ['/youtube-moments', {
    limit: 256,
    parse(body, youtube) {
      if (!hasExactly(body, ['videoId']) || typeof body.videoId !== 'string' || !VIDEO_ID.test(body.videoId)) return null;
      const videoId = body.videoId;
      return async () => ({ moments: await youtube.findMoments(videoId) });
    },
  }],
  ['/translate-cues', {
    limit: 16_384,
    parse(body, youtube) {
      if (!hasExactly(body, ['language', 'texts']) || !isCaptionLanguage(body.language)) return null;
      const texts = cueTexts(body.texts), language = body.language;
      return texts ? async () => ({ texts: await youtube.translate(texts, language) }) : null;
    },
  }],
]);

export function dispatcherWithYouTube(deps: DispatcherDeps, youtube: YouTubeRouteDeps = { findMoments: findYouTubeMoments, translate: translateTexts }) {
  const inner = dispatcher(deps);
  return async (req: IncomingMessage, res: ServerResponse) => {
    const route = ROUTES.get(req.url ?? '');
    if (!route) return inner(req, res);
    const reply = (status: number, body: object) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    const supplied = Buffer.from(req.headers.authorization ?? ''); const expected = Buffer.from(`Bearer ${deps.secret}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: 'Unauthorized' });
    if (req.method !== 'POST') return reply(404, { error: 'Not found' });
    let run: (() => Promise<object>) | null;
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > route.limit) { reply(413, { error: 'Request too large' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      run = route.parse(JSON.parse(Buffer.concat(chunks).toString()), youtube);
    } catch { run = null; }
    if (!run) return reply(400, { error: 'Invalid request' });
    let result: object;
    try { result = await run(); } catch { return reply(502, { error: 'Service unavailable' }); }
    return reply(200, result);
  };
}
