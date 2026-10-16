import { describe, expect, it } from 'vitest';
import { mediaMetadataFromProbe } from './mediaMetadata.js';

describe('mediaMetadataFromProbe', () => {
  it('converts a trusted probe to persisted integer metadata', () => {
    expect(mediaMetadataFromProbe({ durationSec: 1.2344, width: 1080, height: 1920, hasAudio: true, hasVideo: true })).toEqual({
      mediaDurationMs: 1_234, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true,
    });
  });

  it('persists the video stream duration when longer audio extends the container', () => {
    expect(mediaMetadataFromProbe({ durationSec: 3, videoDurationSec: 2, audioDurationSec: 3, width: 320, height: 180, hasAudio: true, hasVideo: true }).mediaDurationMs).toBe(2_000);
  });

  it.each([
    { durationSec: 0.099, width: 1, height: 1, hasAudio: false, hasVideo: true },
    { durationSec: 300.001, width: 1, height: 1, hasAudio: false, hasVideo: true },
    { durationSec: Number.NaN, width: 1, height: 1, hasAudio: false, hasVideo: true },
    { durationSec: 1, width: 0, height: 1, hasAudio: false, hasVideo: true },
    { durationSec: 1, width: 16_385, height: 1, hasAudio: false, hasVideo: true },
    { durationSec: 1, width: 1, height: 0, hasAudio: false, hasVideo: true },
    { durationSec: 1, width: 1, height: 16_385, hasAudio: false, hasVideo: true },
    { durationSec: 1, width: 1, height: 1, hasAudio: false, hasVideo: false },
    { durationSec: 1, width: 1, height: 1, hasAudio: 'yes', hasVideo: true },
  ])('rejects invalid rendered media %#', probe => {
    expect(() => mediaMetadataFromProbe(probe as never)).toThrow('Invalid video media');
  });
});
