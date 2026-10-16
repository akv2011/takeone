// YouTube moment shapes shared by Convex and the web app. The dispatcher route returns the same
// field names, so a moment keeps one shape from Gemini's answer to the share page.
import { v, type Infer } from 'convex/values';
import { captionLanguageValidator } from './captions';

export const MOMENT_LIMITS = { moments: 3, minSec: 15, maxSec: 60, hookWords: 6, hookChars: 60, whyChars: 160, cues: 20, cueChars: 120 } as const;

export const cueValidator = v.object({ start_sec: v.number(), text: v.string() });
export const momentValidator = v.object({ start_sec: v.number(), end_sec: v.number(), hook: v.string(), why: v.string(), cues: v.array(cueValidator) });
export type Cue = Infer<typeof cueValidator>;
export type Moment = Infer<typeof momentValidator>;

export const translationValidator = v.object({ moment: v.number(), language: captionLanguageValidator, texts: v.array(v.string()) });
export type MomentTranslation = Infer<typeof translationValidator>;
const analysisFields = { userId: v.string(), videoId: v.string(), url: v.string(), createdAt: v.number() };
/** youtubeMoments row: only a done analysis carries moments and translations. */
export const youtubeMomentsTable = v.union(
  v.object({ ...analysisFields, status: v.literal('running') }),
  v.object({ ...analysisFields, status: v.literal('failed') }),
  v.object({ ...analysisFields, status: v.literal('done'), moments: v.array(momentValidator), translations: v.array(translationValidator) }),
);
export type MomentAnalysisRow = Infer<typeof youtubeMomentsTable>;
/** What youtubeMoments:latest returns to the owner. */
export type MomentAnalysis = { id: string; videoId: string; createdAt: number }
  & ({ status: 'running' | 'failed' } | { status: 'done'; moments: Moment[]; translations: MomentTranslation[] });
/** What youtubeMoments:shared returns to anyone holding the token. */
export type SharedMoment = { videoId: string; moment: Moment };

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const SHARE_TOKEN = /^[a-f0-9]{32}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

export type YouTubeLink = { videoId: string } | { error: 'playlist' | 'invalid' };

/** One public video from a watch, youtu.be or Shorts link. Any link that carries a playlist is refused. */
export function parseYouTubeLink(input: string): YouTubeLink {
  const text = input.trim();
  if (!text || text.length > 2048) return { error: 'invalid' };
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return { error: 'invalid' }; }
  const host = url.hostname.toLowerCase(), path = url.pathname.replace(/\/$/, '');
  if (url.username || url.password || url.port || !(host === 'youtu.be' || YOUTUBE_HOSTS.has(host))) return { error: 'invalid' };
  if (url.searchParams.has('list')) return { error: 'playlist' };
  const id = host === 'youtu.be' ? path.slice(1)
    : path === '/watch' ? url.searchParams.get('v') ?? ''
    : /^\/shorts\/[^/]+$/.test(path) ? path.slice('/shorts/'.length) : '';
  return VIDEO_ID.test(id) ? { videoId: id } : { error: 'invalid' };
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
