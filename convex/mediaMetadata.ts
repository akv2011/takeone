import { ConvexError, v } from 'convex/values';

export const MAX_MEDIA_DIMENSION = 16_384;
export const mediaMetadataArgs = {
  mediaDurationMs: v.number(), mediaWidth: v.number(), mediaHeight: v.number(), mediaHasAudio: v.boolean(),
};

export function hasTrustedMediaMetadata(metadata: any): boolean {
  return Number.isInteger(metadata?.mediaDurationMs) && metadata.mediaDurationMs >= 100 && metadata.mediaDurationMs <= 300_000 &&
    Number.isInteger(metadata?.mediaWidth) && metadata.mediaWidth >= 1 && metadata.mediaWidth <= MAX_MEDIA_DIMENSION &&
    Number.isInteger(metadata?.mediaHeight) && metadata.mediaHeight >= 1 && metadata.mediaHeight <= MAX_MEDIA_DIMENSION &&
    typeof metadata?.mediaHasAudio === 'boolean';
}

export function hasManagedVideoOutput(job: any): boolean {
  return typeof job?.storageKey === 'string' &&
    new RegExp(`^videos/${String(job._id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[A-Za-z0-9_-]{1,128}\\.mp4$`).test(job.storageKey);
}

export function validateMediaMetadata(metadata: {
  mediaDurationMs: number; mediaWidth: number; mediaHeight: number; mediaHasAudio: boolean;
}) {
  if (!hasTrustedMediaMetadata(metadata)) throw new ConvexError('INVALID_MEDIA_METADATA');
  return {
    mediaDurationMs: metadata.mediaDurationMs, mediaWidth: metadata.mediaWidth,
    mediaHeight: metadata.mediaHeight, mediaHasAudio: metadata.mediaHasAudio,
  };
}
