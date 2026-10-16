import { structuredJob, type EditTransforms } from '../media/structuredEdit.js';
// A4 — gateway handler (platform-agnostic). Production Telegram ingress and reservations live in Convex.
// Flow: free-tier cap -> route -> (YouTube ownership confirm) -> enqueue -> reply with file.
import { route, ClarifyError, ImpossibleError } from '../router/index.js';
import { cleanupOutput } from '../queue/index.js';
import type { JobSpec, JobResult, Op, Platform, BrollSegment, GifOverlay, ZoomWindow } from '../types.js';

// per-clip plan from auto-moments (LLM): reframe + b-roll cutaways + hook card + stickers + zooms
export interface EditPlan {
  reframe?: 'crop' | 'fit';
  broll?: BrollSegment[];
  hook?: string;
  gifs?: GifOverlay[];
  zooms?: ZoomWindow[];
}

export interface Incoming {
  transforms?: EditTransforms;
  captionStyle?: 'none' | 'clean' | 'meme' | 'karaoke';
  music?: import('../media/music.js').MusicMix;
  userId: string;
  platform: Platform;
  text: string;
  attachmentPath?: string;
  isPro: boolean;
  mode?: JobSpec['mode'];
  aspect?: '9:16' | '1:1' | '16:9';
  confirmedOwnership?: boolean;   // set once the user confirms rights to a YouTube clip
  editPlan?: EditPlan;            // set by the auto-moments flow
}

// pure: fold an EditPlan into the routed ops. Order matters:
//   format -> zoom (A-roll emphasis) -> cutaways (b-roll over the final canvas) -> title
//   -> ... captions ... -> gifs (stickers ABOVE the captions) -> watermark
// Reframe mode is set on the format op only when the user didn't ask for one explicitly.
export function applyEditPlan(job: JobSpec, plan: EditPlan): JobSpec {
  const ops: Op[] = [];
  for (const o of job.ops) {
    if (o.op === 'format') {
      ops.push(plan.reframe && !o.mode ? { ...o, mode: plan.reframe } : o);
      if (plan.zooms?.length) ops.push({ op: 'zoom', windows: plan.zooms });
      if (plan.broll?.length) ops.push({ op: 'cutaways', segments: plan.broll });
      if (plan.hook?.trim()) ops.push({ op: 'title', text: plan.hook.trim() });
    } else if (o.op === 'captions') {
      // Bake the chosen sticker into the clean base before capturing the caption layer.
      // Restyling must never refetch provider assets or change the surrounding picture.
      if (plan.gifs?.length) ops.push({ op: 'gifs', items: plan.gifs });
      ops.push(o);
    } else ops.push(o);
  }
  return { ...job, ops };
}
export type Reply =
  | { kind: 'text'; text: string }
  | { kind: 'file'; filePath: string; caption: string };

export interface GatewayDeps {
  enqueue: (job: JobSpec) => Promise<JobResult>;
  data: {
    isPro(userId: string): Promise<boolean>;
    incUsage(userId: string): Promise<number>;
    freeUsedToday(userId: string): Promise<number>;
  };
  freeDailyLimit?: number;         // default 3
  autoCleanup?: boolean;           // delete the artifact after building the reply (default true)
}

function summarize(job: JobSpec): string {
  const parts = job.ops.map((o: Op) => {
    switch (o.op) {
      case 'clip': case 'trim': return `${o.op} ${o.start}-${o.end}`;
      case 'captions': return `${o.style} captions`;
      case 'format': return o.aspect;
      case 'convert': return `→${o.to}`;
      case 'speed': return `${o.factor}x`;
      case 'watermark': return o.show ? 'watermark' : 'no watermark';
      default: return o.op;
    }
  });
  return `done: ${parts.join(' · ')}`;
}

export async function handleMessage(inc: Incoming, deps: GatewayDeps): Promise<Reply[]> {
  const limit = deps.freeDailyLimit ?? 3;
  const isPro = inc.isPro || (await deps.data.isPro(inc.userId));

  // free-tier daily cap
  if (!isPro && (await deps.data.freeUsedToday(inc.userId)) >= limit) {
    return [{ kind: 'text', text: `you've used your ${limit} free reels today. go pro for ₹99 to keep going + drop the watermark → (dodo link)` }];
  }

  let job: JobSpec;
  try {
    job = inc.transforms ? structuredJob(inc.transforms, { ...inc, isPro }) : await route(inc.text, { userId: inc.userId, platform: inc.platform, isPro, attachmentPath: inc.attachmentPath, mode: inc.mode, aspect: inc.aspect });
  } catch (e) {
    if (e instanceof ClarifyError || e instanceof ImpossibleError) return [{ kind: 'text', text: e.message }];
    throw e;
  }
  if (inc.aspect) job.ops = job.ops.map(o => o.op === 'format' ? { ...o, aspect: inc.aspect! } : o);
  if (inc.editPlan) job = applyEditPlan(job, inc.editPlan);
  if (inc.captionStyle !== undefined) {
    if (!['none', 'clean', 'meme', 'karaoke'].includes(inc.captionStyle)) throw Error('Invalid caption style');
    const style = inc.captionStyle;
    if (style === 'none') job.ops = job.ops.filter(o => o.op !== 'captions');
    else if (job.ops.some(o => o.op === 'captions')) job.ops = job.ops.map(o => o.op === 'captions' ? { ...o, style } : o);
    else {
      const index = job.ops.findIndex(o => o.op === 'watermark');
      job.ops.splice(index < 0 ? job.ops.length : index, 0, { op: 'captions', source: job.mode === 'generate' ? 'script' : 'whisper', style });
    }
  }
  if (!inc.transforms && inc.music && job.mode === 'edit' && inc.text === 'Add selected soundtrack') job.ops = [{ op: 'watermark', platform: true, text: 'made with takeone', show: !isPro }];
  if (inc.music) job.ops.push({ op: 'music', ...inc.music });

  // YouTube: require an ownership/rights confirmation before we download anything
  if (job.mode === 'clip' && !inc.confirmedOwnership) {
    return [{ kind: 'text', text: `i'll clip ${job.source.url}. confirm you own or have the rights to use this clip — reply "yes" to proceed.` }];
  }

  const result = await deps.enqueue(job);
  if (!result.ok || !result.outputPath) {
    const where = result.failedOp !== undefined ? ` (step ${result.failedOp + 1})` : '';
    return [{ kind: 'text', text: `couldn't finish that${where}: ${result.error ?? 'unknown error'}` }];
  }

  if (!isPro) await deps.data.incUsage(inc.userId);
  const reply: Reply[] = [{ kind: 'file', filePath: result.outputPath, caption: summarize(job) }];
  return reply;
}

// helper for the platform binding: after sending, clean the artifact
export async function afterSend(filePath: string, deps: GatewayDeps) {
  if (deps.autoCleanup !== false) await cleanupOutput(filePath);
}
