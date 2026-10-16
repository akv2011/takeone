// B2 — ingest. Resolves a JobSpec.source into a local file + validated MediaMeta.
// upload: validate existing file. youtube: yt-dlp --download-sections (segment only). none: passthrough.
import { spawn } from 'node:child_process';
import { stat, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Ingest, JobSpec, MediaMeta, JobCtx } from '../types.js';
import { ffprobe } from '../media/ffmpeg.js';

export class IngestError extends Error {}

// pure, testable: the exact yt-dlp argv for a segment download
export function ytdlpArgs(url: string, sections: string | undefined, dest: string): string[] {
  // merge best video+audio streams — progressive "mp4/best" often resolves to an audio-only
  // or missing stream on modern YouTube (especially from datacenter IPs)
  // 1080p default: a 9:16 crop keeps only ~1/3 of a wide frame, so a 720p source means ~2.7x
  // upscale and soft clips. YouTube throttles datacenter IPs — set YT_MAX_HEIGHT=720 there if
  // section downloads get too slow.
  const cap = Number(process.env.YT_MAX_HEIGHT) || 1080;
  const args = ['--no-playlist', '--no-warnings', '-f', `bv*[height<=${cap}]+ba/b`,
    '--merge-output-format', 'mp4', '-o', dest];
  if (sections) args.push('--download-sections', sections, '--force-keyframes-at-cuts');
  args.push(url);
  return args;
}

export const ingest: Ingest = {
  async probe(path: string, signal?: AbortSignal): Promise<MediaMeta> {
    signal?.throwIfAborted();
    const bytes = (await stat(path)).size;
    const p = await ffprobe(path, signal);
    return { durationSec: p.durationSec, width: p.width, height: p.height, hasAudio: p.hasAudio, hasVideo: p.hasVideo, bytes };
  },

  async ingest(source: JobSpec['source'], limits: JobSpec['limits'], ctx?: JobCtx): Promise<{ path: string; meta: MediaMeta }> {
    if (source.kind === 'none') {
      return { path: '', meta: { durationSec: 0, width: 0, height: 0, hasAudio: false, hasVideo: false, bytes: 0 } };
    }

    if (source.kind === 'youtube') {
      if (!source.url) throw new IngestError('no youtube url');
      ctx?.signal?.throwIfAborted();
      if (!Number.isFinite(limits.timeoutSec) || limits.timeoutSec <= 0) throw new IngestError('invalid ingest timeout');
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new IngestError('video download timed out')), Math.min(limits.timeoutSec * 1000, 2_147_483_647));
      const signal = ctx?.signal ? AbortSignal.any([ctx.signal, deadline.signal]) : deadline.signal;
      const dest = join(ctx?.tmpDir ?? '/tmp', `takeone-yt-${randomUUID()}.mp4`);
      try {
        try {
          await runYtDlp(ytdlpArgs(source.url, source.sections, dest), signal);
        } catch {
          signal.throwIfAborted();
          // Allow one delayed retry for transient extraction failures, within
          // the same deadline. Cancellation also interrupts the delay.
          await delay(12_000, undefined, { signal });
          await runYtDlp(ytdlpArgs(source.url, source.sections, dest), signal);
        }
        const meta = await this.probe(dest, signal);
        signal.throwIfAborted();
        validate(meta, limits);
        return { path: dest, meta };
      } catch (e) {
        await rm(dest, { force: true });
        signal.throwIfAborted();
        if (e instanceof IngestError) throw e;
        throw new IngestError(`couldn't fetch that video: ${(e as Error).message.slice(0, 120)}`);
      } finally {
        clearTimeout(timer);
      }
    }

    // upload
    if (!source.path) throw new IngestError('no file path');
    let meta;
    try {
      meta = await this.probe(source.path);
    } catch (e) {
      const msg = (e as Error).message;
      throw new IngestError(/ENOENT/.test(msg) ? "couldn't find that file" : "couldn't read that file (corrupt or unsupported)");
    }
    validate(meta, limits);
    return { path: source.path, meta };
  },
};

function validate(meta: MediaMeta, limits: JobSpec['limits']) {
  if (!meta.hasVideo && !meta.hasAudio) throw new IngestError('not a media file (no audio or video stream)');
  if (meta.bytes > limits.maxBytes) throw new IngestError(`file too big (${(meta.bytes / 1e6).toFixed(1)}MB > ${(limits.maxBytes / 1e6)}MB)`);
  if (!Number.isFinite(meta.durationSec) || meta.durationSec <= 0) throw new IngestError('media duration is invalid');
  if (meta.durationSec > limits.maxDurationSec) throw new IngestError(`too long (${meta.durationSec.toFixed(0)}s > ${limits.maxDurationSec}s)`);
}

function runYtDlp(args: string[], signal: AbortSignal, timeoutMs = 120_000): Promise<void> {
  signal.throwIfAborted();
  return new Promise((res, rej) => {
    const p = spawn('yt-dlp', args, { detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'] });
    let timedOut = false;
    const stop = () => {
      try {
        if (p.pid && process.platform !== 'win32') process.kill(-p.pid, 'SIGKILL');
        else p.kill('SIGKILL');
      } catch { p.kill('SIGKILL'); }
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
    let err = ''; p.stderr!.on('data', (d) => { err = (err + d).slice(-8192); });
    p.once('error', error => { cleanup(); rej(signal.aborted ? signal.reason : error); });
    p.once('close', c => {
      cleanup();
      if (signal.aborted) rej(signal.reason);
      else if (timedOut) rej(new IngestError('video download attempt timed out'));
      else if (c === 0) res();
      else rej(new IngestError(`yt-dlp failed: ${err.slice(-160)}`));
    });
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
  });
}
