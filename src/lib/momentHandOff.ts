import type { Moment } from '../../convex/youtubeValues';

// Edit uploads stop at 300 seconds (convex/transforms.ts), so a later moment cannot be trimmed from a full copy.
const UPLOAD_MAX_SEC = 300;
const pad = (value: number) => String(value).padStart(2, '0');
export function clock(sec: number) {
  const hours = Math.floor(sec / 3600), minutes = Math.floor(sec / 60) % 60, seconds = sec % 60;
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Prompt and note for the Edit upload tab. backend/src/router/index.ts reads the M:SS range as a trim. */
export function momentHandOff(moment: Pick<Moment, 'start_sec' | 'end_sec'>): { prompt: string; note: string } {
  const start = clock(Math.floor(moment.start_sec)), end = clock(Math.ceil(moment.end_sec));
  return Math.ceil(moment.end_sec) <= UPLOAD_MAX_SEC
    ? { prompt: `Trim ${start} to ${end} and add captions`, note: 'Upload your own copy of this video. The trim is filled in for you.' }
    : { prompt: 'Add captions', note: `Uploads can be up to 5 minutes. Upload your own copy cut to ${start} to ${end}.` };
}
