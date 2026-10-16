import { ff, ffprobe } from './ffmpeg.js';
import type { SavedScenePlan } from '../types.js';

/** Retained composition is the immutable source for every unchanged frame and all audio. */
export async function replaceSceneVideo(source: string, replacement: string, output: string, plan: SavedScenePlan, index: number, signal: AbortSignal) {
  signal.throwIfAborted();
  if (plan.version !== 1 || !Number.isFinite(plan.durationSec) || plan.durationSec <= 0 || plan.durationSec > 300 || !Array.isArray(plan.scenes) || plan.scenes.length < 1 || plan.scenes.length > 12) throw Error('Invalid scene plan');
  let previous = 0;
  for (const s of plan.scenes) {
    if (!Number.isFinite(s.startSec) || !Number.isFinite(s.endSec) || s.startSec !== previous || s.endSec <= s.startSec || s.endSec > plan.durationSec) throw Error('Invalid scene plan');
    previous = s.endSec;
  }
  if (previous !== plan.durationSec) throw Error('Invalid scene plan');
  const [base, clip] = await Promise.all([ffprobe(source, signal), ffprobe(replacement, signal)]);
  const scene = plan.scenes[index];
  if (!Number.isInteger(index) || !scene || !base.hasVideo || !clip.hasVideo || !base.hasAudio || !Number.isFinite(base.durationSec) || base.durationSec > 300.1 ||
    !Number.isFinite(clip.durationSec) || Math.abs(base.durationSec - plan.durationSec) > 0.1 || scene.startSec < 0 || scene.endSec <= scene.startSec || scene.endSec > plan.durationSec) throw Error('Invalid scene replacement source');
  // Initial scene renders are 30fps; snap the replacement window onto that grid.
  const start = Math.ceil(scene.startSec * 30) / 30, end = Math.min(base.durationSec, Math.ceil(scene.endSec * 30) / 30);
  if (end <= start || clip.durationSec < end - start || !base.width || !base.height) throw Error('Replacement clip is too short');
  // Probe a video-only normalization: container duration can include a longer audio tail.
  const normalized = `${output}.replacement.mp4`;
  await ff(['-i', replacement, '-t', String(end - start), '-an', '-vf',
    `setpts=PTS-STARTPTS,scale=${base.width}:${base.height}:force_original_aspect_ratio=increase,crop=${base.width}:${base.height},setsar=1,fps=30`,
    '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', normalized], signal);
  const actual = await ffprobe(normalized, signal);
  if (!actual.hasVideo || !Number.isFinite(actual.durationSec) || actual.durationSec + 0.001 < end - start) throw Error('Replacement clip is too short');
  await ff(['-i', source, '-i', normalized, '-filter_complex',
    `[1:v]trim=duration=${end-start},setpts=PTS-STARTPTS,scale=${base.width}:${base.height}:force_original_aspect_ratio=increase,crop=${base.width}:${base.height},setsar=1,fps=30,setpts=PTS+${start}/TB[r];[0:v][r]overlay=enable='gte(t,${start})*lt(t,${end})':eof_action=pass:repeatlast=0[v]`,
    '-map', '[v]', '-map', '0:a:0', '-t', String(base.durationSec), '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', output], signal);
  return output;
}
