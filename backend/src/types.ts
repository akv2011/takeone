// takeone — frozen shared contracts. Do NOT change without broadcasting (see ../../docs/PLAN.md §0).

export type Op =
  | { op: 'speakerReframe' }
  | { op: 'music'; trackPath: string; volume?: number; duck?: boolean; replaceSourceAudio?: boolean; fadeInSec?: number; fadeOutSec?: number }
  | { op: 'clip';      start: string; end: string }
  | { op: 'trim';      start: string; end: string }
  | { op: 'captions';  source: 'whisper' | 'script'; style: 'karaoke' | 'meme' | 'clean'; colors?: { textColor: string; outlineColor: string }; font?: 'sans' | 'serif' | 'mono'; position?: 'auto' | 'top' | 'middle' | 'bottom'; text?: string;
      cues?: { start: number; end: number; text: string }[] }   // timed cues (whisper words / paced script)
  | { op: 'format';    aspect: '9:16' | '1:1' | '16:9';
      mode?: 'crop' | 'fit';          // crop = fill frame (may cut edges), fit = blur-pad (keeps everything)
      focusX?: number }               // 0-1 horizontal subject center for crop (default 0.5 = center)
  | { op: 'speed';     factor: number }
  | { op: 'convert';   to: 'mp4' | 'mp3' | 'gif' | 'webm' }
  | { op: 'watermark'; platform?: boolean; text: string; show: boolean; position?: 'br' | 'bl' | 'tr' | 'tl' }
  | { op: 'sticker' }
  | { op: 'thumbnail'; at: string }
  | { op: 'voiceover'; voiceId: string; script: string }
  | { op: 'broll';     keywords: string[]; durationSec?: number }
  | { op: 'cutaways';  segments: BrollSegment[] }    // b-roll cutaways over an A-roll clip
  | { op: 'title';     text: string; durationSec?: number }   // hook card over the first seconds
  | { op: 'gifs';      items: GifOverlay[] }         // GIPHY sticker overlays
  | { op: 'zoom';      windows: ZoomWindow[] };      // punch-in zoom windows

// b-roll cutaway window: `at` seconds into the clip, `dur` seconds long
export interface BrollSegment { at: number; dur: number; keywords: string[] }
export interface GifOverlay   { at: number; dur: number; query: string; pos?: 'tc' | 'tr' | 'tl' }
export interface ZoomWindow   { at: number; dur: number }

export type OpName = Op['op'];

export interface MediaMeta {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
  bytes: number;
}

export interface Word { text: string; start: number; end: number; }
export interface Angle { hook: string; premise: string; whyViral: string; }

export type Platform = 'telegram' | 'whatsapp' | 'discord' | 'cli';
export type Mode = 'generate' | 'edit' | 'clip';

export interface JobSpec {
  transforms?: import('./media/structuredEdit.js').EditTransforms;
  id: string;
  userId: string;
  platform: Platform;
  mode: Mode;
  source: { kind: 'upload' | 'youtube' | 'none'; path?: string; url?: string; sections?: string; topic?: string };
  ops: Op[];
  isPro: boolean;
  limits: { maxBytes: number; maxDurationSec: number; timeoutSec: number };
}

export interface JobResult {
  ok: boolean;
  outputPath?: string;
  meta?: { bytes: number; durationSec: number; ms: number };
  failedOp?: number;
  error?: string;
}

export interface SavedScenePlan { version: 1; durationSec: number; scenes: { startSec: number; endSec: number; purpose: string; searchTerms: string[]; shotType: string; motion: string }[] }

export interface JobCtx { onRenderStage?: import('./managed/progress.js').ReportProgress; onScenePlan?: (plan: SavedScenePlan) => Promise<void>; strictMedia?: boolean; tmpDir: string; isPro: boolean; signal?: AbortSignal; }
export interface ChatCtx { userId: string; platform: Platform; attachmentPath?: string; isPro: boolean; mode?: Mode; aspect?: '9:16' | '1:1' | '16:9'; }

// Default per-job limits (safety caps). Overridable per job.
// timeoutSec covers the WHOLE job incl. the YouTube section download (~45s from a throttled
// datacenter IP) + whisper + 3 ffmpeg ops on 2 vCPUs — 120s flaked on real clip jobs
export const DEFAULT_LIMITS = { maxBytes: 50 * 1024 * 1024, maxDurationSec: 300, timeoutSec: 300 };

// ---- Module interfaces (each Batch B/A module implements one of these) ----
export interface MediaCore { runOp(inputPath: string, op: Op, ctx: JobCtx): Promise<{ outputPath: string }>; }
export interface Ingest {
  ingest(source: JobSpec['source'], limits: JobSpec['limits'], ctx?: JobCtx): Promise<{ path: string; meta: MediaMeta }>;
  probe(path: string, signal?: AbortSignal): Promise<MediaMeta>;
}
export interface Transcriber { transcribe(path: string, signal?: AbortSignal): Promise<{ srt: string; words: Word[] }>; }
export interface ContentOptions { strict?: boolean; signal?: AbortSignal }
export interface Content {
  brainstorm(topic: string, facts?: string[], options?: ContentOptions): Promise<Angle[]>;
  script(angle: Angle, facts?: string[], options?: ContentOptions): Promise<{ script: string; captions: string }>;
  captionText(words: Word[], style: 'karaoke' | 'meme' | 'clean'): Promise<string>;
}
