import type { Probe } from './ffmpeg.js';

export interface MediaMetadata {
  mediaDurationMs: number;
  mediaWidth: number;
  mediaHeight: number;
  mediaHasAudio: boolean;
}

export function mediaMetadataFromProbe(probe: Probe): MediaMetadata {
  const videoDurationSec = probe.videoDurationSec ?? probe.durationSec;
  const mediaDurationMs = Math.round(videoDurationSec * 1000);
  if (!probe.hasVideo || !Number.isFinite(videoDurationSec) || videoDurationSec < 0.1 || videoDurationSec > 300 ||
    !Number.isInteger(mediaDurationMs) || !Number.isInteger(probe.width) || probe.width < 1 || probe.width > 16_384 ||
    !Number.isInteger(probe.height) || probe.height < 1 || probe.height > 16_384 || typeof probe.hasAudio !== 'boolean') {
    throw Error('Invalid video media');
  }
  return { mediaDurationMs, mediaWidth: probe.width, mediaHeight: probe.height, mediaHasAudio: probe.hasAudio };
}
