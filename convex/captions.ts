import { v } from 'convex/values';
export const captionStyleValidator = v.union(v.literal('none'), v.literal('clean'), v.literal('meme'), v.literal('karaoke'));

/** Worker completion writes these paired keys; callers must check source ownership. */
export function captionArchiveSource(source: { cleanStorageKey?: string; captionStorageKey?: string }) {
  const match = source.captionStorageKey?.match(/^captions\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.json$/);
  if (!match || source.cleanStorageKey !== `videos/${match[1]}/${match[2]}-clean.mp4`) return null;
  return { sourceStorageKey: source.cleanStorageKey, sourceCaptionStorageKey: source.captionStorageKey };
}

export function validCaptionTexts(texts: string[]) {
  return texts.length > 0 && texts.length <= 10000 && texts.every(text => typeof text === 'string' && text.trim().length > 0 && text.length <= 4000) && new TextEncoder().encode(JSON.stringify(texts)).byteLength <= 256 * 1024;
}

export const captionPositionValidator = v.union(v.literal('auto'), v.literal('top'), v.literal('middle'), v.literal('bottom'));

export const captionFontValidator = v.union(v.literal('sans'), v.literal('serif'), v.literal('mono'));

// Every code has a Cloud Translation target and a Chirp 3 HD voice. backend/src/languages.ts maps
// each one to those provider codes, and tests/caption-languages.test.ts keeps the two lists equal.
export const CAPTION_LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'hi', label: 'Hindi' }, { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' }, { code: 'bn', label: 'Bengali' }, { code: 'mr', label: 'Marathi' },
  { code: 'ja', label: 'Japanese' }, { code: 'ko', label: 'Korean' }, { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'th', label: 'Thai' }, { code: 'id', label: 'Indonesian' }, { code: 'vi', label: 'Vietnamese' },
] as const;
export const captionLanguageValidator = v.union(...CAPTION_LANGUAGES.map(({ code }) => v.literal(code)));

export function captionTransformSource(source: { cleanStorageKey?: string; captionStorageKey?: string; captionStyle?: string; captionFont?: string; captionPosition?: string }) {
  const archive = captionArchiveSource(source);
  return archive ? { ...archive, captionTransform: true, captionStyle: source.captionStyle,
    captionFont: source.captionFont, captionPosition: source.captionPosition } : {};
}
