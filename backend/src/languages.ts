// Caption languages the app offers, with the Cloud Translation target and Chirp 3 HD locale for each.
// Keys match CAPTION_LANGUAGES in convex/captions.ts; tests/caption-languages.test.ts keeps them equal.
export const CAPTION_LANGUAGES = {
  en: { name: 'English', translate: 'en', voiceLocale: 'en-US' },
  hi: { name: 'Hindi', translate: 'hi', voiceLocale: 'hi-IN' },
  ta: { name: 'Tamil', translate: 'ta', voiceLocale: 'ta-IN' },
  te: { name: 'Telugu', translate: 'te', voiceLocale: 'te-IN' },
  bn: { name: 'Bengali', translate: 'bn', voiceLocale: 'bn-IN' },
  mr: { name: 'Marathi', translate: 'mr', voiceLocale: 'mr-IN' },
  ja: { name: 'Japanese', translate: 'ja', voiceLocale: 'ja-JP' },
  ko: { name: 'Korean', translate: 'ko', voiceLocale: 'ko-KR' },
  zh: { name: 'Simplified Chinese', translate: 'zh-CN', voiceLocale: 'cmn-CN' },
  th: { name: 'Thai', translate: 'th', voiceLocale: 'th-TH' },
  id: { name: 'Indonesian', translate: 'id', voiceLocale: 'id-ID' },
  vi: { name: 'Vietnamese', translate: 'vi', voiceLocale: 'vi-VN' },
} as const;

export type CaptionLanguage = keyof typeof CAPTION_LANGUAGES;

export const isCaptionLanguage = (value: unknown): value is CaptionLanguage =>
  typeof value === 'string' && Object.hasOwn(CAPTION_LANGUAGES, value);

/** Compares a BCP-47 tag such as Speech-to-Text's "en-us" or "cmn-hans-cn" with a caption language. */
export function sameLanguage(tag: string | undefined, target: CaptionLanguage): boolean {
  const base = tag?.toLowerCase().split('-')[0];
  return (base === 'cmn' ? 'zh' : base) === target;
}

/**
 * The configured voice when it already speaks the target language, otherwise the same Chirp 3 HD
 * voice in the target locale. Chirp 3 HD names are <locale>-Chirp3-HD-<voice>, and the voices are
 * shared across its locales. Any other voice family has no guaranteed match, so it fails closed.
 */
export function narrationVoice(target: CaptionLanguage, voice: { voiceName: string; languageCode: string }): { voiceName: string; languageCode: string } {
  if (sameLanguage(voice.languageCode, target)) return voice;
  const { name, voiceLocale } = CAPTION_LANGUAGES[target];
  const chirp = voice.voiceName.match(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,4})+-(Chirp3-HD-[A-Za-z]+)$/i)?.[1];
  if (!chirp) throw Error(`No ${name} narration voice: TTS_VOICE must be a Chirp 3 HD voice to narrate in ${voiceLocale}`);
  return { voiceName: `${voiceLocale}-${chirp}`, languageCode: voiceLocale };
}
