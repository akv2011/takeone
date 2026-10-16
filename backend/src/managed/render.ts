import { replaceSceneVideo } from '../media/sceneReplacement.js';
import { applyBrandLogo, validateBrand } from '../media/brand.js';
import { hookOp } from '../media/hook.js';
import { googleJson } from '../google/auth.js';
import { ff, ffprobe } from '../media/ffmpeg.js';
import { uploadArtifacts } from './artifacts.js';
import type { Bucket } from '@google-cloud/storage';
import { Readable } from 'node:stream';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { generateScene } from '../video/veo.js';
import { buildDirectorPrompt } from '../video/directorPrompt.js';
import { assertGeneratedVideoMotion } from '../video/motion.js';
import { archiveCaptionLayer, canArchiveCaptionLayer, type CaptionArchive } from '../media/captionArchive.js';
import { transformCaptionArchive } from '../media/captionTransform.js';
import { restyleCaptionArchive, replaceCaptionTexts } from '../media/captionRestyle.js';
import { mediaCore } from '../media/index.js';
import { createTakeOne } from '../app.js';
import { downloadSoundtrack } from './soundtrack.js';
import { pickMoments } from '../moments.js';
import { prepareDelivery } from '../media/delivery.js';
import { DEFAULT_LIMITS, type SavedScenePlan } from '../types.js';
import { boundedDownload } from './files.js';
import { renderClaim } from './pipeline.js';
import { validVideoKey, type ClaimedJob } from './worker.js';
import { progressReporter, type RenderStage } from './progress.js';
import { renderAssembly } from '../media/assembly.js';
import { isCaptionLanguage } from '../languages.js';

interface RendererDeps {
  work: string; bucket: Pick<Bucket, 'file'>;
  env(key: string): string;
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
  saveScenePlan(job: ClaimedJob, plan: SavedScenePlan): Promise<boolean>;
  sendProgress(job: ClaimedJob, stage: RenderStage): Promise<boolean>;
  telegram(method: string, body: object): Promise<{ file_path?: string; file_size?: number }>;
  onArchive(archive: CaptionArchive): void;
  /** The burned-in caption text (the script, for a prompt video) and the hook card, for the claims check and cover. */
  onText?(kind: 'captions' | 'hook', text: string): void;
}
export function createManagedRenderer({ work, bucket, env, call, sendProgress, saveScenePlan, telegram, onArchive, onText }: RendererDeps) {
  const leaseArgs = (job: ClaimedJob) => ({ jobId: job.jobId, leaseToken: job.leaseToken });
  return async (job: ClaimedJob, signal: AbortSignal): Promise<string> => {
    if (job.captionLanguage !== undefined && !isCaptionLanguage(job.captionLanguage)) throw Error('Unsupported caption language');
    if (job.brand) validateBrand(job.brand);
    const runOp: typeof mediaCore.runOp = (input, op, ctx) => {
      if (op.op === 'captions') onText?.('captions', op.text?.trim() || (op.cues ?? []).map(cue => cue.text).join(' '));
      if (op.op === 'title') onText?.('hook', op.text);
      return mediaCore.runOp(input, op.op === 'captions' && job.brand ? { ...op, font: op.font ?? job.brand.font, colors: job.brand } : op, ctx);
    };
    const report = progressReporter(stage => sendProgress(job, stage), signal);
    const deliverable = async (path: string, requireAudio = false) => {
      if (job.brand?.logo) path = await applyBrandLogo(path, job.brand.logo, work, signal);
      await report('checking');
      return prepareDelivery(path, join(work, 'delivery.mp4'), { ...DEFAULT_LIMITS, requireAudio }, signal);
    };
    if (job.timelineExport) {
      if (job.mode !== 'edit' || !job.assemblySources || job.aspect !== job.timelineExport.timeline.aspect) throw Error('Invalid assembly claim');
      await report('source');
      const assembled = await renderAssembly(job.timelineExport, job.assemblySources, join(work, 'assembly.mp4'), work, {
        bucket, convexUrl: env('CONVEX_URL'),
      }, signal);
      await report('cut');
      const branded = await mediaCore.runOp(assembled, { op: 'watermark', platform: true, text: 'made with takeone', show: !job.isPro }, { tmpDir: work, isPro: job.isPro, strictMedia: true, signal });
      return deliverable(branded.outputPath, true);
    }
    if (job.sceneReplacement) {
      await report('source');
      const match = job.sourceCaptionStorageKey?.match(/^captions\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.json$/);
      if (!match || job.mode !== 'edit' || job.sourceStorageKey !== `videos/${match[1]}/${match[2]}-clean.mp4` || !job.sourceUploadUrl) throw Error('Invalid scene archive');
      const source = join(work, 'scene-source.mp4'), replacement = join(work, 'scene-replacement.mp4');
      const target = { videoPath: join(work, 'caption-free.mp4'), metadataPath: join(work, 'captions.json') };
      await boundedDownload(bucket.file(job.sourceStorageKey).createReadStream(), source, DEFAULT_LIMITS.maxBytes, signal);
      await boundedDownload(bucket.file(job.sourceCaptionStorageKey!).createReadStream(), target.metadataPath, 512 * 1024, signal);
      const url = new URL(job.sourceUploadUrl), deployment = new URL(env('CONVEX_URL'));
      if (url.protocol !== 'https:' || url.origin !== deployment.origin || !url.pathname.startsWith('/api/storage/')) throw Error('Invalid replacement upload');
      const response = await fetch(url.href, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
      if (!response.ok || !response.body) throw Error('Replacement download failed');
      await boundedDownload(Readable.fromWeb(response.body as never), replacement, DEFAULT_LIMITS.maxBytes, signal);
      if (!await saveScenePlan(job, job.sceneReplacement.plan)) throw Error('Scene plan lease lost');
      signal.throwIfAborted();
      await report('cut');
      await replaceSceneVideo(source, replacement, target.videoPath, job.sceneReplacement.plan, job.sceneReplacement.index, signal);
      const raw = await readFile(target.metadataPath, { encoding: 'utf8', signal });
      const ctx = { tmpDir: work, isPro: job.isPro, strictMedia: true, signal };
      const output = await restyleCaptionArchive(target.videoPath, raw, job.captionStyle ?? JSON.parse(raw).style, ctx, runOp, job.captionPosition, job.captionFont);
      const branded = await mediaCore.runOp(output, { op: 'watermark', platform: true, text: 'made with takeone', show: !job.isPro }, ctx);
      onArchive({ ...target, sceneOnly: JSON.parse(raw).cues.length === 0 });
      return deliverable(branded.outputPath, true);
    }
    if (job.sourceCaptionStorageKey) {
      await report('source');
      const match = job.sourceCaptionStorageKey.match(/^captions\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.json$/);
      if (!match || job.mode !== 'edit' || (!job.captionStyle && !job.captionTransform) || job.sourceStorageKey !== `videos/${match[1]}/${match[2]}-clean.mp4`) throw Error('Invalid caption archive source');
      const target = { videoPath: join(work, 'caption-free.mp4'), metadataPath: join(work, 'captions.json') };
      await boundedDownload(bucket.file(job.sourceStorageKey).createReadStream(), target.videoPath, DEFAULT_LIMITS.maxBytes, signal);
      await boundedDownload(bucket.file(job.sourceCaptionStorageKey).createReadStream(), target.metadataPath, 512 * 1024, signal);
      const ctx = { tmpDir: work, isPro: job.isPro, strictMedia: true, signal };
      let raw = await readFile(target.metadataPath, { encoding: 'utf8', signal });
      if (job.captionTexts !== undefined) { raw = replaceCaptionTexts(raw, job.captionTexts); await writeFile(target.metadataPath, raw, { signal }); }
      let music;
      if (job.captionTransform && job.music) {
        const trackPath = join(work, 'soundtrack');
        await downloadSoundtrack(job.music, trackPath, signal, key => bucket.file(key).createReadStream());
        music = { trackPath, volume: job.music.volume, duck: job.music.duck, replaceSourceAudio: job.music.replaceSourceAudio };
      }
      await report(job.captionTransform || job.captionStyle === 'none' ? 'cut' : 'finishing');
      const output = job.captionTransform
        ? await transformCaptionArchive(target.videoPath, raw, target, { speakerReframe: job.speakerReframe, hookTitle: job.hookTitle, transforms: job.transforms, prompt: job.prompt, userId: job.userId, aspect: job.aspect, style: job.captionStyle, font: job.captionFont, position: job.captionPosition, music }, ctx, runOp)
        : await restyleCaptionArchive(target.videoPath, raw, job.captionStyle!, ctx, runOp, job.captionPosition, job.captionFont);
      const branded = await mediaCore.runOp(output, { op: 'watermark', platform: true, text: 'made with takeone', show: !job.isPro }, ctx);
      onArchive(target);
      return deliverable(branded.outputPath);
    }
    if (job.hookTitle !== undefined) {
      if (job.mode !== 'edit' || !validVideoKey(job.sourceStorageKey)) throw Error('Invalid hook source');
      const op = hookOp(job.hookTitle);
      await report('source');
      const source = join(work, 'hook-source.mp4');
      await boundedDownload(bucket.file(job.sourceStorageKey).createReadStream(), source, DEFAULT_LIMITS.maxBytes, signal);
      const ctx = { tmpDir: work, isPro: job.isPro, strictMedia: true, signal };
      await report('finishing');
      const titled = await mediaCore.runOp(source, op, ctx);
      const branded = await mediaCore.runOp(titled.outputPath, { op: 'watermark', platform: true, text: 'made with takeone', show: !job.isPro }, ctx);
      return deliverable(branded.outputPath);
    }
    if (job.speakerReframe) {
      if (job.mode !== 'edit' || !validVideoKey(job.sourceStorageKey)) throw Error('Invalid speaker source');
      await report('source');
      const source = join(work, 'speaker-source.mp4');
      await boundedDownload(bucket.file(job.sourceStorageKey).createReadStream(), source, DEFAULT_LIMITS.maxBytes, signal);
      const ctx = { tmpDir: work, isPro: job.isPro, strictMedia: true, signal };
      await report('cut');
      const reframed = await runOp(source, { op: 'speakerReframe' }, ctx);
      const branded = await mediaCore.runOp(reframed.outputPath, { op: 'watermark', platform: true, text: 'made with takeone', show: !job.isPro }, ctx);
      return deliverable(branded.outputPath);
    }
    if (job.generationKind === 'ai') {
      if (job.aspect === '1:1') throw Error('AI scenes support portrait or landscape');
      await report('footage');
      const directedPrompt = buildDirectorPrompt({
        concept: job.prompt,
        durationSeconds: 8,
        aspect: job.aspect,
      });
      const key = await generateScene({ project: env('VEO_PROJECT'), region: env('VEO_REGION'), model: env('VEO_MODEL'), bucket: env('GCS_BUCKET') },
        { jobId: job.jobId, prompt: directedPrompt, aspect: job.aspect, operation: job.aiOperation }, {
          begin: async () => await call('beginAi', leaseArgs(job)) as boolean,
          save: async operation => { await call('saveAiOperation', { ...leaseArgs(job), operation }); },
          post: (url, data, signal) => googleJson('Veo', url, { json: data, signal, timeoutMs: 30_000 }),
          wait: async signal => { await delay(10000, undefined, { signal }); },
        }, signal);
      const source = join(work, 'ai-scene.mp4');
      await boundedDownload(bucket.file(key).createReadStream(), source, DEFAULT_LIMITS.maxBytes, signal);
      await assertGeneratedVideoMotion(source, signal);
      const ctx = { tmpDir: work, isPro: job.isPro, strictMedia: true, signal };
      await report('cut');
      let branded = await mediaCore.runOp(source, { op: 'watermark', platform: true, text: 'made with takeone', show: !job.isPro }, ctx);
      if (job.music) {
        await report('finishing');
        const trackPath = join(work, 'ai-soundtrack');
        await downloadSoundtrack(job.music, trackPath, signal, key => bucket.file(key).createReadStream());
        branded = await mediaCore.runOp(branded.outputPath, { op: 'music', trackPath, volume: job.music.volume, duck: job.music.duck, replaceSourceAudio: job.music.replaceSourceAudio }, ctx);
      }
      return deliverable(branded.outputPath, true);
    }
    const downloadUpload = async (href: string, dest: string, signal: AbortSignal) => {
      const url = new URL(href);
      const deployment = new URL(env('CONVEX_URL'));
      if (url.protocol !== 'https:' || url.origin !== deployment.origin || !url.pathname.startsWith('/api/storage/')) throw Error('Invalid uploaded source');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
      if (!response.ok || !response.body) throw Error('Upload download failed');
      await boundedDownload(Readable.fromWeb(response.body as never), dest, DEFAULT_LIMITS.maxBytes, signal);
    };
    // Gemini reads only gs:// objects, and the clip path cuts the same local download afterwards.
    const stagedKey = `sources/${job.jobId}.mp4`;
    const app = createTakeOne({ runOp, executor: { onRenderStage: report, strictMedia: true, captionLanguage: job.captionLanguage, maxConcurrent: 1, outDir: join(work, 'out'), signal,
      onScenePlan: async plan => {
        signal.throwIfAborted();
        if (!await saveScenePlan(job, plan)) throw Error('Scene plan lease lost');
        signal.throwIfAborted();
      },
      onUncaptionedOutput: job.mode !== 'generate' ? undefined : async (input, ctx) => {
        const target = { videoPath: join(work, 'caption-free.mp4'), metadataPath: join(work, 'captions.json') };
        const checked = await prepareDelivery(input, join(work, 'uncaptioned-normalized.mp4'), DEFAULT_LIMITS, ctx.signal);
        await copyFile(checked, target.videoPath);
        await writeFile(target.metadataPath, JSON.stringify({ version: 1, style: 'clean', cues: [] }), { signal: ctx.signal });
        onArchive({ ...target, sceneOnly: true });
      },
      onCaptionLayer: job.sourceStorageKey ? undefined : async (input, caption, after, ctx) => {
        // Provider-backed overlays must retain their exact source assets
        // before we can promise an otherwise matching caption-free export.
        if (!canArchiveCaptionLayer(after)) return;
        const target = { videoPath: join(work, 'caption-free.mp4'), metadataPath: join(work, 'captions.json') };
        await archiveCaptionLayer(input, caption, after, ctx, runOp, target);
        onArchive(target);
      } },
      data: { isPro: async () => false, freeUsedToday: async () => 0, incUsage: async () => 0 } });
    const rendered = await renderClaim(job, signal, { handle: app.handle,
      async pick(source, count, signal) {
        await report('moments');
        if ('youtubeUrl' in source) return pickMoments(source, count, signal, job.captionLanguage);
        if (!validVideoKey(source.storageKey) && source.storageKey !== stagedKey) throw Error('Invalid source key');
        return pickMoments({ gcsUri: `gs://${env('GCS_BUCKET')}/${source.storageKey}` }, count, signal, job.captionLanguage);
      },
      async music(job, signal) {
        if (!job.music) throw Error('Invalid music selection');
        const trackPath = join(work, 'soundtrack');
        await downloadSoundtrack(job.music, trackPath, signal, key => bucket.file(key).createReadStream());
        return { trackPath, volume: job.music.volume, duck: job.music.duck, replaceSourceAudio: job.music.replaceSourceAudio };
      },
      async source(job, signal) {
        await report('source');
        const dest = join(work, 'source.mp4');
        if (job.sourceStorageKey) {
          if (!validVideoKey(job.sourceStorageKey)) throw Error('Invalid source key');
          await boundedDownload(bucket.file(job.sourceStorageKey).createReadStream(), dest, DEFAULT_LIMITS.maxBytes, signal);
        } else if (job.sourceUploadUrl) {
          await downloadUpload(job.sourceUploadUrl, dest, signal);
        } else if (job.telegramFileId) {
          const file = await telegram('getFile', { file_id: job.telegramFileId });
          if (!file.file_path || !/^[A-Za-z0-9_/-]+\.[A-Za-z0-9]+$/.test(file.file_path) || file.file_path.split('/').includes('..') || (file.file_size ?? 0) > DEFAULT_LIMITS.maxBytes) throw Error('Invalid Telegram source');
          const response = await fetch(`https://api.telegram.org/file/bot${env('TELEGRAM_BOT_TOKEN')}/${file.file_path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
          if (!response.ok || !response.body) throw Error('Source download failed');
          await boundedDownload(Readable.fromWeb(response.body as never), dest, DEFAULT_LIMITS.maxBytes, signal);
        } else throw Error('Edit mode requires a source');
        return dest;
      },
      async stage(job, signal) {
        if (!job.sourceUploadUrl) throw Error('Invalid uploaded source');
        const path = join(work, 'source.mp4');
        await downloadUpload(job.sourceUploadUrl, path, signal);
        const meta = await ffprobe(path, signal);
        if (!meta.hasVideo) throw Error('Uploaded source has no video');
        // Gemini is told video/mp4, so a QuickTime or WebM upload is rewrapped or re-encoded first.
        const copyable = (meta.videoCodec === 'h264' || meta.videoCodec === 'hevc') && (!meta.hasAudio || meta.audioCodec === 'aac');
        const copy = join(work, 'gemini-source.mp4');
        await ff(['-protocol_whitelist', 'file', '-i', path, '-map', '0:v:0', '-map', '0:a:0?',
          ...(copyable ? ['-c', 'copy'] : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac']), '-movflags', '+faststart', copy], signal);
        try {
          await uploadArtifacts(bucket, [{ path: copy, key: stagedKey, contentType: 'video/mp4' }], signal, event => console.warn(event));
        } catch (error) {
          // Create-only: a retry of this job finds the copy an earlier attempt made from the same upload.
          if ((error as { code?: unknown }).code !== 412) throw error;
        }
        return { path, storageKey: stagedKey };
      },
    });
    return deliverable(rendered, job.mode === 'generate');
      };
}
