import { validateStructuredDuration } from './media/structuredEdit.js';
// A5 — integration wiring. Composes ingest + transcribe + content + media + queue + gateway.
// `prepare` resolves the source and enriches ops per mode before the ffmpeg op loop runs.
import { join } from 'node:path';
import { createExecutor, type RunOp, type ExecutorOptions } from './queue/index.js';
import { handleMessage, type GatewayDeps, type Incoming, type Reply } from './gateway/index.js';
import { mediaCore } from './media/index.js';
import { ff, ffprobe } from './media/ffmpeg.js';
import { wordsAtCaption } from './media/timeline.js';
import { wordsToCues } from './media/captions.js';
import { detectFocusX } from './media/focus.js';
import { ingest } from './ingest/index.js';
import { transcriber } from './transcribe/index.js';
import { content } from './content/index.js';
import { planStockScenes } from './content/scenes.js';
import { scenePlanAtOutput } from './content/sceneProjection.js';
import { renderStockScenes } from './media/scenes.js';
import { search } from './search/index.js';
import { data } from './data/index.js';
import type { JobSpec, JobCtx, Op } from './types.js';

export async function prepare(job: JobSpec, ctx: JobCtx): Promise<{ inputPath?: string; ops: Op[] }> {
  ctx.signal?.throwIfAborted();
  // MODE generate: brainstorm -> script -> voiceover + b-roll -> mux a base reel; captions get the script text
  if (job.mode === 'generate') {
    await ctx.onRenderStage?.('script');
    const topic = job.source.topic ?? '';
    const research = await search(topic);                 // Linkup: live facts to ground the reel
    ctx.signal?.throwIfAborted();
    const contentOptions = { strict: ctx.strictMedia, signal: ctx.signal };
    const angles = await content.brainstorm(topic, research.facts, contentOptions);
    ctx.signal?.throwIfAborted();
    const { script } = await content.script(angles[0], research.facts, contentOptions);
    ctx.signal?.throwIfAborted();
    await ctx.onRenderStage?.('narration');
    const voice = await mediaCore.runOp('', { op: 'voiceover', voiceId: '', script }, ctx);
    const voiceDur = (await ffprobe(voice.outputPath)).durationSec;
    if (!Number.isFinite(voiceDur) || voiceDur <= 0) throw Error('Invalid narration duration');
    ctx.signal?.throwIfAborted();
    await ctx.onRenderStage?.('footage');
    let brollPath: string;
    if (ctx.strictMedia) {
      const plan = await planStockScenes(topic, script, voiceDur, contentOptions);
      ctx.signal?.throwIfAborted();
      await ctx.onScenePlan?.(scenePlanAtOutput(plan, job.ops));
      ctx.signal?.throwIfAborted();
      brollPath = await renderStockScenes(plan, voiceDur, ctx,
        job.ops.find((op): op is Extract<Op, { op: 'format' }> => op.op === 'format')?.aspect ?? '9:16');
    } else {
      brollPath = (await mediaCore.runOp('', { op: 'broll', keywords: topic.split(/\s+/).slice(0, 4), durationSec: voiceDur }, ctx)).outputPath;
    }
    const base = join(ctx.tmpDir, 'base.mp4');
    await ff([...(ctx.strictMedia ? [] : ['-stream_loop', '-1']), '-i', brollPath, '-i', voice.outputPath, '-map', '0:v', '-map', '1:a',
      '-t', String(voiceDur), '-c:v', 'copy', '-c:a', 'aac', base], ctx.signal);
    // Production captions use the spoken track's timestamps; evenly paced words
    // are reserved for the explicit offline CLI/test harness.
    const w = script.trim().split(/\s+/);
    const per = voiceDur / w.length;
    const needsCaptions = job.ops.some(o => o.op === 'captions');
    if (needsCaptions && ctx.strictMedia) await ctx.onRenderStage?.('transcription');
    const timedWords = !needsCaptions ? [] : ctx.strictMedia ? (await transcriber.transcribe(voice.outputPath, ctx.signal)).words
      : w.map((text, i) => ({ text, start: i * per, end: (i + 1) * per }));
    if (needsCaptions && ctx.strictMedia && !timedWords.length) throw new Error('Narration transcription returned no speech');
    const ops = job.ops.map((o, index) => (o.op === 'captions' ? { ...o, text: script,
      cues: wordsToCues(wordsAtCaption(timedWords, job.ops.slice(0, index)), 3).map(cue => o.style === 'meme' ? { ...cue, text: cue.text.toUpperCase() } : cue) } : o));
    return { inputPath: base, ops };
  }

  // MODE edit/clip: ingest (validate upload / yt-dlp segment), then enrich whisper captions
  await ctx.onRenderStage?.('source');
  const { path, meta } = await ingest.ingest(job.source, job.limits, ctx);
  if (job.transforms) validateStructuredDuration(job.transforms, meta.durationSec);
  ctx.signal?.throwIfAborted();
  let ops = job.ops;

  // smart reframe: when the source is wider than the target canvas, a blind center-crop cuts
  // off-center subjects. Ask the vision LLM where the subject is -> focused crop; when it's
  // unsure (or offline) fall back to blur-pad fit so nothing is ever cut. Explicit user
  // intent (mode already set) is respected as-is.
  const RATIOS: Record<string, number> = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9 };
  const fmt = ops.find((o) => o.op === 'format' && o.mode !== 'fit' && o.focusX === undefined);
  if (fmt?.op === 'format' && path && meta.width / Math.max(1, meta.height) > (RATIOS[fmt.aspect] ?? 9 / 16) + 0.01) {
    const focusX = await detectFocusX(path, ctx);
    ops = ops.map((o) => (o === fmt
      ? (focusX !== null ? { ...o, mode: 'crop' as const, focusX }
        // detection unsure: an explicit crop request stays a center crop; otherwise blur-pad
        : { ...o, mode: fmt.mode ?? ('fit' as const) })
      : o));
  }
  const cap = ops.find((o) => o.op === 'captions' && o.source === 'whisper' && !(o as any).text);
  if (cap && path) {
    await ctx.onRenderStage?.('transcription');
    try {
      const { words } = await transcriber.transcribe(path, ctx.signal);
      if (ctx.strictMedia && !words.length) throw new Error('Transcription returned no speech');
      const text = await content.captionText(words, (cap as any).style);
      const upper = (cap as any).style === 'meme';
      const alignedWords = wordsAtCaption(words, ops.slice(0, ops.indexOf(cap)));
      const cues = wordsToCues(alignedWords, 3).map((c) => (upper ? { ...c, text: c.text.toUpperCase() } : c));
      ops = ops.map((o) => (o === cap ? { ...o, text, cues } : o));
    } catch (error) { if (ctx.strictMedia) throw error; /* Offline harness permits a caption placeholder. */ }
  }
  return { inputPath: path, ops };
}

export function createTakeOne(opts: { runOp?: RunOp; usePrepare?: boolean; executor?: ExecutorOptions; freeDailyLimit?: number; data?: GatewayDeps['data'] } = {}) {
  const executor = createExecutor(
    { runOp: opts.runOp ?? mediaCore.runOp, prepare: opts.usePrepare === false ? undefined : prepare },
    opts.executor ?? {},
  );
  const deps: GatewayDeps = {
    enqueue: executor.enqueue,
    data: opts.data ?? {
      isPro: (u) => data.isPro(u),
      incUsage: (u) => data.incUsage(u),
      freeUsedToday: (u) => data.freeUsedToday(u),
    },
    freeDailyLimit: opts.freeDailyLimit,
  };
  return {
    handle: (inc: Incoming): Promise<Reply[]> => handleMessage(inc, deps),
    stats: executor.stats,
  };
}
