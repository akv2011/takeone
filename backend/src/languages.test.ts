import { expect, it } from 'vitest';
import { isCaptionLanguage, narrationVoice, sameLanguage } from './languages.js';

const charon = { voiceName: 'en-US-Chirp3-HD-Charon', languageCode: 'en-US' };

it('matches Speech-to-Text tags to caption languages by base language', () => {
  expect(sameLanguage('en-us', 'en')).toBe(true);
  expect(sameLanguage('cmn-Hans-CN', 'zh')).toBe(true);
  expect(sameLanguage('hi-IN', 'mr')).toBe(false);
  expect(sameLanguage('yue-Hant-HK', 'zh')).toBe(false);
  expect(sameLanguage(undefined, 'en')).toBe(false);
});

it('accepts only allowlisted codes', () => {
  expect(isCaptionLanguage('hi')).toBe(true);
  for (const value of ['fr', 'en-US', 'toString', '', undefined, 7]) expect(isCaptionLanguage(value)).toBe(false);
});

it('swaps the locale prefix of a Chirp 3 HD voice', () => {
  expect(narrationVoice('hi', charon)).toEqual({ voiceName: 'hi-IN-Chirp3-HD-Charon', languageCode: 'hi-IN' });
  expect(narrationVoice('zh', charon)).toEqual({ voiceName: 'cmn-CN-Chirp3-HD-Charon', languageCode: 'cmn-CN' });
  expect(narrationVoice('ja', { voiceName: 'en-us-chirp3-hd-Leda', languageCode: 'en-US' })).toEqual({ voiceName: 'ja-JP-chirp3-hd-Leda', languageCode: 'ja-JP' });
});

it('keeps the configured voice when it already speaks the target language', () => {
  const indian = { voiceName: 'en-IN-Chirp3-HD-Kore', languageCode: 'en-IN' };
  expect(narrationVoice('en', indian)).toBe(indian);
  expect(narrationVoice('en', { voiceName: 'en-US-Neural2-A', languageCode: 'en-US' })).toEqual({ voiceName: 'en-US-Neural2-A', languageCode: 'en-US' });
});

it('fails closed when the configured voice has no counterpart in the target locale', () => {
  expect(() => narrationVoice('ta', { voiceName: 'en-US-Neural2-A', languageCode: 'en-US' })).toThrow('No Tamil narration voice: TTS_VOICE must be a Chirp 3 HD voice to narrate in ta-IN');
});
