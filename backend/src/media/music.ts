import { isAbsolute } from 'node:path';
import { ff, ffprobe } from './ffmpeg.js';

export interface MusicMix {
  trackPath: string;
  volume?: number; // linear gain; quiet bed defaults to 0.18
  duck?: boolean;
  replaceSourceAudio?: boolean; // Removes all original sound, including speech.
  fadeInSec?: number;
  fadeOutSec?: number;
}

/** Mix an already-authorized local soundtrack. Never resolve user-provided URLs. */
export async function mixMusic(input: string, output: string, options: MusicMix, signal?: AbortSignal) {
  if (!isAbsolute(options.trackPath)) throw new Error('Music requires a local authorized track');
  const volume = options.volume ?? 0.18;
  const fadeIn = options.fadeInSec ?? 0.4, fadeOut = options.fadeOutSec ?? 1;
  if (![volume, fadeIn, fadeOut].every(Number.isFinite) || volume < 0 || volume > 1 || fadeIn < 0 || fadeIn > 10 || fadeOut < 0 || fadeOut > 10) throw new Error('Invalid music mix settings');
  signal?.throwIfAborted();
  const [video, track] = await Promise.all([ffprobe(input), ffprobe(options.trackPath)]);
  if (!video.hasVideo || !Number.isFinite(video.durationSec) || video.durationSec <= 0) throw new Error('Music needs a valid video');
  if (!track.hasAudio || !Number.isFinite(track.durationSec) || track.durationSec <= 0) throw new Error('Music file has no playable audio');
  const duration = video.durationSec;
  const bed = `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${volume},afade=t=in:d=${Math.min(fadeIn, duration / 2)},afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${Math.min(fadeOut, duration)}[bed]`;
  let graph: string;
  if (video.hasAudio && !options.replaceSourceAudio) {
    const voice = `[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS`;
    graph = options.duck === false
      ? `${bed};${voice}[voice];[voice][bed]amix=inputs=2:duration=first:normalize=0[mix]`
      : `${bed};${voice},asplit=2[voice][control];[bed][control]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=300:makeup=1[ducked];[voice][ducked]amix=inputs=2:duration=first:normalize=0[mix]`;
  } else graph = `${bed};[bed]anull[mix]`;
  // Limit peaks without automatic makeup gain (which would undo the chosen bed level).
  graph += ';[mix]alimiter=limit=0.95:level=0:latency=1[aout]';
  await ff(['-protocol_whitelist', 'file', '-i', input,
    '-stream_loop', '-1', '-protocol_whitelist', 'file', '-i', options.trackPath,
    '-filter_complex', graph, '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000',
    '-t', String(duration), '-movflags', '+faststart', output], signal);
}
