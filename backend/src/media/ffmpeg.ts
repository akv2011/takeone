// Shared ffmpeg/ffprobe runner. Arg-arrays only (no shell strings). Honors AbortSignal.
import { spawn } from 'node:child_process';

const FONT = process.platform === 'darwin'
  ? '/System/Library/Fonts/Supplemental/Arial.ttf'
  : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

let filterCache: Set<string> | null = null;
export async function hasFilter(name: string): Promise<boolean> {
  if (!filterCache) {
    filterCache = await new Promise<Set<string>>((res) => {
      const p = spawn('ffmpeg', ['-hide_banner', '-filters'], { timeout: 10_000, killSignal: 'SIGKILL' });
      let out = ''; p.stdout.on('data', (d) => (out += d));
      p.on('close', () => {
        const set = new Set<string>();
        for (const line of out.split('\n')) { const m = line.trim().split(/\s+/); if (m[1]) set.add(m[1]); }
        res(set);
      });
      p.on('error', () => res(new Set()));
    });
  }
  return filterCache.has(name);
}
export function fontFile(): string { return FONT; }

// x264 defaults to preset=medium, which takes minutes on a small VPS; veryfast keeps renders in
// seconds. Skipped for full stream copies (-c copy) and ops that choose their own preset.
function withFastPreset(args: string[]): string[] {
  const fullCopy = args.some((a, i) => a === '-c' && args[i + 1] === 'copy');
  if (fullCopy || args.includes('-preset')) return args;
  return [...args.slice(0, -1), '-preset', 'veryfast', args[args.length - 1]];
}

export function ff(args: string[], signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('Render aborted'));
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...withFastPreset(args)]);
    const onAbort = () => { try { p.kill('SIGKILL'); } catch {} };
    signal?.addEventListener('abort', onAbort);
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-8192); });
    p.on('error', reject);
    p.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-200)}`));
    });
  });
}

export interface Probe { durationSec: number; videoDurationSec?: number; audioDurationSec?: number; width: number; height: number; hasAudio: boolean; hasVideo: boolean; videoCodec?: string; audioCodec?: string; pixelFormat?: string; }
export function ffprobe(path: string, signal?: AbortSignal): Promise<Probe> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries',
      'format=duration:stream=codec_type,codec_name,pix_fmt,width,height,duration', '-of', 'json', '-protocol_whitelist', 'file', path], { signal, timeout: 20_000, killSignal: 'SIGKILL' });
    let out = ''; p.stdout.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) { reject(new Error('Unable to probe media')); return; }
      try {
        const j = JSON.parse(out || '{}');
        const streams = j.streams ?? [];
        const v = streams.find((s: any) => s.codec_type === 'video');
        const a = streams.find((s: any) => s.codec_type === 'audio');
        const streamDuration = (stream: any) => Number.isFinite(Number(stream?.duration)) && Number(stream.duration) > 0 ? Number(stream.duration) : undefined;
        resolve({
          durationSec: Number(j.format?.duration ?? 0),
          videoDurationSec: streamDuration(v), audioDurationSec: streamDuration(a),
          width: v?.width ?? 0, height: v?.height ?? 0,
          hasAudio: streams.some((s: any) => s.codec_type === 'audio'),
          hasVideo: !!v, videoCodec: v?.codec_name, pixelFormat: v?.pix_fmt,
          audioCodec: a?.codec_name,
        });
      } catch (e) { reject(e as Error); }
    });
  });
}
