// Pure caption builders (fully testable, no ffmpeg). Produce .ass / .srt strings that the
// `subtitles` filter burns on a full ffmpeg build; degrade to a bar on limited builds.
import type { Word } from '../types.js';

function ts(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = (sec % 60);
  const ss = s.toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${ss}`;
}

// Chinese, Japanese, Thai, Lao, Khmer and Myanmar put no spaces between words. Script_Extensions
// also covers the shared CJK marks (。、ー). Two words get a space only when neither side touching
// the boundary is one of these, so mixed text keeps "iPhone 15" and Latin stays unchanged.
const UNSPACED = String.raw`[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}\uFF01-\uFF60]`;
const ENDS_UNSPACED = new RegExp(`${UNSPACED}$`, 'u'), STARTS_UNSPACED = new RegExp(`^${UNSPACED}`, 'u');
export function joinWords(words: readonly string[]): string {
  return words.reduce((text, word, i) =>
    i === 0 ? word : text + (ENDS_UNSPACED.test(text) || STARTS_UNSPACED.test(word) ? '' : ' ') + word, '');
}

// Group words into short caption cues (~3 words each for karaoke feel).
export function wordsToCues(words: Word[], perCue = 3): { start: number; end: number; text: string }[] {
  const cues: { start: number; end: number; text: string }[] = [];
  if (!Number.isInteger(perCue) || perCue < 1) throw new Error('Invalid caption group size');
  let chunk: Word[] = [];
  const flush = () => {
    if (chunk.length) cues.push({ start: chunk[0].start, end: chunk[chunk.length - 1].end, text: joinWords(chunk.map(w => w.text)) });
    chunk = [];
  };
  for (const word of words) {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start) throw new Error('Invalid caption timing');
    if (chunk.length && word.start - chunk[chunk.length - 1].end > 0.8) flush();
    chunk.push(word);
    if (chunk.length >= perCue) flush();
  }
  flush();
  return cues;
}

const STYLES: Record<string, string> = {
  // name, fontsize, primary colour (&HBBGGRR), outline, alignment (2=bottom-center, 5=mid)
  karaoke: 'Style: Default,Arial,54,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,120,1',
  meme:    'Style: Default,Arial,60,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,8,40,40,60,1',
  clean:   'Style: Default,Arial,46,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,90,1',
};

export interface CaptionCanvas { width: number; height: number }
const DEFAULT_CANVAS = { width: 1080, height: 1920 };
function canvasHeader(canvas: CaptionCanvas) {
  if (![canvas.width, canvas.height].every(n => Number.isInteger(n) && n >= 2 && n <= 8192)) throw new Error('Invalid caption canvas');
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${canvas.width}\nPlayResY: ${canvas.height}\nWrapStyle: 0\n\n`;
}
function canvasStyle(style: string, canvas: CaptionCanvas, title = false, position?: 'auto' | 'top' | 'middle' | 'bottom', font?: 'sans' | 'serif' | 'mono', colors?: { textColor: string; outlineColor: string }) {
  const fields = style.split(',');
  if (colors) {
    const ass = (hex: string) => { if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw Error('Invalid caption color'); return '&H00' + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3); };
    fields[3] = ass(colors.textColor); fields[4] = ass(colors.outlineColor);
  }
  if (font !== undefined) {
    const families = { sans: 'DejaVu Sans', serif: 'DejaVu Serif', mono: 'DejaVu Sans Mono' };
    if (!Object.hasOwn(families, font)) throw Error('Invalid caption font');
    fields[1] = families[font];
  }
  if (position !== undefined && !['auto', 'top', 'middle', 'bottom'].includes(position)) throw Error('Invalid caption position');
  if (position && position !== 'auto') fields[16] = String({ top: 8, middle: 5, bottom: 2 }[position]);
  const scale = Math.min(canvas.width, canvas.height) / 1080;
  fields[2] = String(Math.max(10, Math.round(Number(fields[2]) * scale)));
  fields[14] = String(Math.max(1, Math.round(Number(fields[14]) * scale)));
  fields[fields.length - 4] = String(Math.round(canvas.width * 0.08));
  fields[fields.length - 3] = String(Math.round(canvas.width * (canvas.height > canvas.width ? 0.12 : 0.08)));
  fields[fields.length - 2] = String(Math.round(canvas.height * (title ? 0.1 : fields[16] === '8' ? 0.12 : 0.16)));
  return fields.join(',');
}

// CapCut-style pop-in: fade in fast + overshoot scale then settle. Pure libass \t transforms —
// zero render cost vs. plain cues, no Remotion needed.
const POP = '\\fad(100,60)\\fscx80\\fscy80\\t(0,110,\\fscx112\\fscy112)\\t(110,220,\\fscx100\\fscy100)';

// Non-Latin text uses the Noto sans family from the Dockerfile packages, so the serif and mono
// choices apply to Latin only. Kana precedes Han so Japanese with kanji picks JP.
const SCRIPT_FONTS: [RegExp, string][] = [
  [/\p{Script=Devanagari}/u, 'Noto Sans Devanagari'],
  [/\p{Script=Bengali}/u, 'Noto Sans Bengali'],
  [/\p{Script=Tamil}/u, 'Noto Sans Tamil'],
  [/\p{Script=Telugu}/u, 'Noto Sans Telugu'],
  [/\p{Script=Thai}/u, 'Noto Sans Thai'],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'Noto Sans CJK JP'],
  [/\p{Script=Hangul}/u, 'Noto Sans CJK KR'],
  [/\p{Script=Han}/u, 'Noto Sans CJK SC'],
];
export function scriptFont(text: string): string | undefined {
  return SCRIPT_FONTS.find(([re]) => re.test(text))?.[1];
}

export function toAss(cues: { start: number; end: number; text: string }[], style: 'karaoke' | 'meme' | 'clean' = 'karaoke', canvas: CaptionCanvas = DEFAULT_CANVAS, position?: 'auto' | 'top' | 'middle' | 'bottom', font?: 'sans' | 'serif' | 'mono', colors?: { textColor: string; outlineColor: string }): string {
  const header =
    canvasHeader(canvas) +
    '[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n' +
    canvasStyle(STYLES[style] ?? STYLES.karaoke, canvas, false, position, font, colors) + '\n\n' +
    '[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n';
  const events = cues
    .map((c) => {
      const fn = scriptFont(c.text), pop = style === 'clean' ? '' : POP;   // clean stays static; karaoke/meme pop in
      const anim = fn ? `{\\fn${fn}${pop}}` : pop ? `{${pop}}` : '';
      return `Dialogue: 0,${ts(c.start)},${ts(c.end)},Default,,0,0,0,,${anim}${c.text.replace(/[\n{}\\]/g, ' ')}`;
    })
    .join('\n');
  return header + events + '\n';
}

// Hook title card: big bold line at the top for the first seconds, pop + fade out.
export function titleAss(text: string, durationSec: number, canvas: CaptionCanvas = DEFAULT_CANVAS): string {
  const clean = text.replace(/[\n{}\\]/g, ' ').trim();
  const fn = scriptFont(clean);
  return canvasHeader(canvas) +
    '[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n' +
    canvasStyle('Style: Hook,Arial,72,&H0000FFFF,&H00000000,-1,0,0,0,100,100,0,0,1,5,0,8,60,60,140,1', canvas, true) + '\n\n' +
    '[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n' +
    `Dialogue: 1,${ts(0)},${ts(durationSec)},Hook,,0,0,0,,{${fn ? `\\fn${fn}` : ''}\\fad(150,250)${POP.replace('\\fad(100,60)', '')}}${clean.toUpperCase()}\n`;
}

export function toSrt(cues: { start: number; end: number; text: string }[]): string {
  const t = (s: number) => new Date(s * 1000).toISOString().substr(11, 12).replace('.', ',');
  return cues.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}\n`).join('\n');
}
