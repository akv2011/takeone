import { timestampRange } from '../router/index.js';
import type { Incoming, Reply } from '../gateway/index.js';
import type { Moment } from '../moments.js';
import type { ClaimedJob } from './worker.js';
export function youtubeUrl(text: string): string | null {
  const candidate = text.match(/https?:\/\/[^\s]+/g)?.find(raw => {
    try { const u = new URL(raw); return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname) && (u.hostname === 'youtu.be' ? /^\/[\w-]+$/.test(u.pathname) : u.pathname === '/watch' && /^[\w-]+$/.test(u.searchParams.get('v') ?? '') || /^\/shorts\/[\w-]+$/.test(u.pathname)); } catch { return false; }
  });
  return candidate ?? null;
}
export interface PipelineDeps {
  music?(job: ClaimedJob, signal: AbortSignal): Promise<Incoming['music']>;
  source(job: ClaimedJob, signal: AbortSignal): Promise<string | undefined>;
  /** Downloads an uploaded source and copies it into the bucket, where Gemini can read it. */
  stage(job: ClaimedJob, signal: AbortSignal): Promise<{ path: string; storageKey: string }>;
  pick(source: { youtubeUrl: string } | { storageKey: string }, count: number, signal: AbortSignal): Promise<Moment[]>;
  handle(inc: Incoming): Promise<Reply[]>;
}
export async function renderClaim(job: ClaimedJob, signal: AbortSignal, deps: PipelineDeps): Promise<string> {
  signal.throwIfAborted();
  let text = job.prompt;
  let editPlan: Incoming['editPlan'];
  // A clip of a stored or uploaded video is cut from the downloaded source as an edit,
  // captioned like every YouTube clip.
  let storedClip = false;
  let attachmentPath: string | undefined;
  if (job.mode === 'clip') {
    const url = youtubeUrl(text);
    if (!url && !job.sourceStorageKey && !job.sourceUploadUrl) throw Error('Clip mode requires a YouTube URL or a stored video');
    storedClip = !url;
    if (!timestampRange(text)) {
      let source: Parameters<PipelineDeps['pick']>[0];
      if (url) source = { youtubeUrl: url };
      else if (job.sourceStorageKey) source = { storageKey: job.sourceStorageKey };
      else {
        const staged = await deps.stage(job, signal);
        attachmentPath = staged.path;
        source = { storageKey: staged.storageKey };
      }
      const [moment] = await deps.pick(source, 1, signal);
      if (!moment) throw Error('No moment found');
      text = url ? `clip ${url} ${moment.start} to ${moment.end} ${text.replace(url, '')}` : `trim ${moment.start} to ${moment.end} ${text}`;
      // Cutaways and stickers need a stock or GIPHY key; without one Gemini's picks for them are dropped.
      const stock = Boolean(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY), stickers = Boolean(process.env.GIPHY_API_KEY);
      editPlan = { hook: moment.hook, reframe: moment.reframe, zooms: moment.zooms, broll: stock ? moment.broll : undefined, gifs: stickers ? moment.gifs : undefined };
    }
    if (storedClip) text = `${text} captions`;
  }
  attachmentPath ??= job.mode === 'edit' || storedClip ? await deps.source(job, signal) : undefined;
  signal.throwIfAborted();
  const music = job.music ? await deps.music?.(job, signal) : undefined;
  if (job.music && !music) throw Error('Selected soundtrack could not be loaded');
  const replies = await deps.handle({ transforms: job.transforms, captionStyle: job.captionStyle, music, userId: job.userId, platform: 'cli', text, mode: storedClip ? 'edit' : job.mode, aspect: job.aspect,
    attachmentPath, isPro: job.isPro, confirmedOwnership: true, editPlan });
  signal.throwIfAborted();
  const files = replies.filter((reply): reply is Extract<Reply, {kind: 'file'}> => reply.kind === 'file');
  if (files.length !== 1 || !files[0].filePath.endsWith('.mp4')) {
    const said = replies.filter((reply): reply is Extract<Reply, {kind: 'text'}> => reply.kind === 'text').map(reply => reply.text).join(' | ');
    throw Error(`Pipeline did not produce one MP4${said ? `: ${said.slice(0, 200)}` : ''}`);
  }
  return files[0].filePath;
}
