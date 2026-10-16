// Pure ffmpeg filtergraph builders for the reframe + cutaway + zoom + gif ops (fully unit-testable).
import type { BrollSegment, GifOverlay, ZoomWindow } from '../types.js';

// crop x expression: center the crop window on focusX, clamped to the frame
const cropX = (focusX: number) => `'min(max(iw*${focusX.toFixed(4)}-ow/2,0),iw-ow)'`;

// aspect conversion filter.
//  crop (default): fill the frame; optional focusX pans the crop window onto the subject
//  fit: blur-pad — full source fits inside, blurred self fills the rest (nothing gets cut)
export function formatFilter(w: number, h: number, mode: 'crop' | 'fit' = 'crop',
  focusX?: number, blur: string = 'gblur=sigma=8'): string {
  if (mode === 'fit') {
    // blur at quarter resolution then upscale — visually identical, ~16x faster than
    // blurring the full canvas (full-res gblur blew the render past job timeouts)
    const [qw, qh] = [Math.round(w / 4 / 2) * 2, Math.round(h / 4 / 2) * 2];
    return `split[bg][fg];` +
      `[bg]scale=${qw}:${qh}:force_original_aspect_ratio=increase,crop=${qw}:${qh},${blur},scale=${w}:${h}[bgb];` +
      `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2[fgs];` +
      `[bgb][fgs]overlay=(W-w)/2:(H-h)/2`;
  }
  const x = focusX !== undefined && Math.abs(focusX - 0.5) > 0.02 ? `:${cropX(focusX)}:'(ih-oh)/2'` : '';
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}${x}`;
}

// clamp cutaway windows to sane bounds: inside the clip with breathing room at both ends,
// max 4s each, max 2 per clip, non-overlapping
export function clampSegments(segments: BrollSegment[], clipDur: number): BrollSegment[] {
  const out: BrollSegment[] = [];
  for (const s of [...segments].sort((a, b) => a.at - b.at)) {
    if (!s.keywords?.length || !Number.isFinite(s.at) || !Number.isFinite(s.dur)) continue;
    const at = Math.max(1.5, s.at);
    const dur = Math.min(4, Math.max(1, s.dur));
    if (clipDur > 0 && at + dur > clipDur - 1.5) continue;                  // too close to the end
    if (out.length && at < out[out.length - 1].at + out[out.length - 1].dur + 1) continue; // overlap
    out.push({ at, dur, keywords: s.keywords.slice(0, 4) });
    if (out.length === 2) break;
  }
  return out;
}

// punch-in zoom: instant 1.08x jump-cut during each window (zoompan per-frame, d=1).
// Jump cuts read as intentional emphasis; gradual zoom expressions drift and jitter.
export function zoomFilter(windows: ZoomWindow[], w: number, h: number, fps = 30): string {
  const cond = windows.map((z) => `between(in_time,${z.at.toFixed(3)},${(z.at + z.dur).toFixed(3)})`).join('+');
  return `zoompan=z='if(${cond},1.08,1)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${w}x${h}:fps=${fps}`;
}

// clamp zoom windows: 1-3s each, max 2, non-overlapping, inside the clip
export function clampZooms(windows: ZoomWindow[], clipDur: number): ZoomWindow[] {
  const out: ZoomWindow[] = [];
  for (const z of [...windows].sort((a, b) => a.at - b.at)) {
    if (!Number.isFinite(z.at) || !Number.isFinite(z.dur)) continue;
    const at = Math.max(0.5, z.at);
    const dur = Math.min(3, Math.max(1, z.dur));
    if (clipDur > 0 && at + dur > clipDur - 0.5) continue;
    if (out.length && at < out[out.length - 1].at + out[out.length - 1].dur + 1.5) continue;
    out.push({ at, dur });
    if (out.length === 2) break;
  }
  return out;
}

// sticker overlay positions on a 1080x1920 canvas (clear of bottom captions + top title)
const GIF_POS: Record<string, string> = {
  tc: 'x=(W-w)/2:y=H*0.17', tr: 'x=W-w-W*0.045:y=H*0.19', tl: 'x=W*0.045:y=H*0.19',
};

// filter_complex overlaying n looping gif inputs (1..n) onto the base (0), each only during
// its window. shortest=1 so the endless looping gif never extends the output.
export function gifGraph(items: GifOverlay[], w: number, h: number): string {
  if (![w, h].every(n => Number.isInteger(n) && n >= 2 && n <= 8192)) throw Error('Invalid sticker canvas');
  const boxWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.35));
  const boxHeight = Math.max(2, Math.floor(h * 0.25));
  const parts: string[] = [];
  let prev = '0:v';
  items.forEach((g, i) => {
    parts.push(`[${i + 1}:v]scale=${boxWidth}:${boxHeight}:force_original_aspect_ratio=decrease[g${i}]`);
    const label = i === items.length - 1 ? 'vout' : `v${i}`;
    parts.push(`[${prev}][g${i}]overlay=${GIF_POS[g.pos ?? 'tr'] ?? GIF_POS.tr}:shortest=1` +
      `:enable='between(t,${g.at.toFixed(3)},${(g.at + g.dur).toFixed(3)})'[${label}]`);
    prev = label;
  });
  return parts.join(';');
}

// clamp gif overlays: max 1, 2-4s, inside the clip
export function clampGifs(items: GifOverlay[], clipDur: number): GifOverlay[] {
  for (const g of items) {
    if (!g.query?.trim() || !Number.isFinite(g.at) || !Number.isFinite(g.dur)) continue;
    const at = Math.max(0.5, g.at);
    const dur = Math.min(4, Math.max(2, g.dur));
    if (clipDur > 0 && at + dur > clipDur - 0.5) continue;
    return [{ at, dur, query: g.query.trim(), pos: g.pos }];
  }
  return [];
}

// filter_complex overlaying n b-roll inputs (inputs 1..n) onto the base video (input 0).
// Each b-roll is scaled/cropped to the canvas, time-shifted to its window, and overlaid
// only during that window (eof_action=pass returns to the A-roll afterwards).
export function cutawayGraph(segments: BrollSegment[], w: number, h: number): string {
  const parts: string[] = [];
  let prev = '0:v';
  segments.forEach((s, i) => {
    const at = s.at.toFixed(3);
    parts.push(`[${i + 1}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
      `trim=duration=${s.dur.toFixed(3)},setpts=PTS-STARTPTS+${at}/TB[b${i}]`);
    const label = i === segments.length - 1 ? 'vout' : `v${i}`;
    parts.push(`[${prev}][b${i}]overlay=eof_action=pass:enable='between(t,${at},${(s.at + s.dur).toFixed(3)})'[${label}]`);
    prev = label;
  });
  return parts.join(';');
}
