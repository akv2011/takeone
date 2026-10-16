import { expect, it } from 'vitest';
import { scriptFont, titleAss, toAss } from './captions.js';

// Captured from the pre-change generator: Latin output must stay byte-identical.
const LATIN = {"k": "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Arial,54,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,86,130,307,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\nDialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,{\\fad(100,60)\\fscx80\\fscy80\\t(0,110,\\fscx112\\fscy112)\\t(110,220,\\fscx100\\fscy100)}Hello brave world\n", "c": "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Arial,46,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,86,130,307,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\nDialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,Hello brave world\n", "t": "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Hook,Arial,72,&H0000FFFF,&H00000000,-1,0,0,0,100,100,0,0,1,5,0,8,86,130,192,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\nDialogue: 1,0:00:00.00,0:00:03.00,Hook,,0,0,0,,{\\fad(150,250)\\fscx80\\fscy80\\t(0,110,\\fscx112\\fscy112)\\t(110,220,\\fscx100\\fscy100)}BIG HOOK LINE\n"};
const latin = [{ start: 0, end: 1.5, text: 'Hello brave world' }];
const events = (ass: string) => ass.split('[Events]')[1];
const line = (ass: string) => ass.split('\n').find(l => l.startsWith('Dialogue'))!;

it('picks a Noto family by script, kana before Han', () => {
  expect(scriptFont('नमस्ते दुनिया')).toBe('Noto Sans Devanagari');
  expect(scriptFont('வணக்கம்')).toBe('Noto Sans Tamil');
  expect(scriptFont('สวัสดี')).toBe('Noto Sans Thai');
  expect(scriptFont('こんにちは世界')).toBe('Noto Sans CJK JP');
  expect(scriptFont('世界')).toBe('Noto Sans CJK SC');
  expect(scriptFont('안녕하세요')).toBe('Noto Sans CJK KR');
  expect(scriptFont('你好，世界')).toBe('Noto Sans CJK SC');
  expect(scriptFont('Hello नमस्ते')).toBe('Noto Sans Devanagari');
  for (const t of ['Hello world', '12345', "Wait... what? (yes), no!", '']) expect(scriptFont(t)).toBeUndefined();
});

it('leaves Latin output byte-identical', () => {
  expect(toAss(latin, 'karaoke')).toBe(LATIN.k);
  expect(toAss(latin, 'clean')).toBe(LATIN.c);
  expect(titleAss('Big hook line', 3)).toBe(LATIN.t);
});

it('adds the family first in the override block', () => {
  const hi = [{ start: 0, end: 1, text: 'नमस्ते दुनिया' }];
  expect(line(toAss(hi, 'karaoke'))).toContain('{\\fnNoto Sans Devanagari\\fad(100,60)');
  expect(line(toAss(hi, 'meme'))).toContain('{\\fnNoto Sans Devanagari\\fad(100,60)');
  const clean = line(toAss(hi, 'clean'));
  expect(clean).toContain('{\\fnNoto Sans Devanagari}');
  expect(clean).not.toContain('\\t(');
  expect(line(titleAss('สวัสดี', 2))).toContain('\\fnNoto Sans Thai');
  expect(toAss(hi, 'clean', undefined, undefined, 'serif')).toContain('Style: Default,DejaVu Serif,');
});

it('still strips injected braces from non-Latin cues', () => {
  const ass = toAss([{ start: 0, end: 1, text: 'नमस्ते {\\pos(0,0)}' }], 'clean');
  expect(events(ass)).not.toContain('pos(0,0)}');
  expect(events(ass)).not.toContain('{\\pos');
  expect(line(ass)).toMatch(/\{\\fnNoto Sans Devanagari\}नमस्ते   pos\(0,0\) $/);
});
