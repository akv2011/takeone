import { expect, test } from 'vitest';
import { wordsAtCaption } from './timeline.js';
test('trim removes earlier words, clips boundary words and speed keeps speech timing', () => {
  const words = [{ text: 'before', start: 0, end: 1 }, { text: 'hello', start: 1.9, end: 2.5 }, { text: 'world', start: 3, end: 4.5 }, { text: 'after', start: 5, end: 6 }];
  expect(wordsAtCaption(words, [{ op: 'trim', start: '0:02', end: '0:04' }, { op: 'speed', factor: 2 }])).toEqual([
    { text: 'hello', start: 0, end: 0.25 }, { text: 'world', start: 0.5, end: 1 },
  ]);
  expect(words[1].start).toBe(1.9);
});
test('sequential cuts use the current timeline, including slow motion', () => {
  expect(wordsAtCaption([{ text: 'hello', start: 10, end: 11 }], [
    { op: 'trim', start: '0:08', end: '0:15' }, { op: 'speed', factor: 0.5 }, { op: 'trim', start: '0:03', end: '0:07' },
  ])).toEqual([{ text: 'hello', start: 1, end: 3 }]);
});
test('invalid timing and unsupported speed fail explicitly', () => {
  expect(() => wordsAtCaption([], [{ op: 'speed', factor: 0 }])).toThrow();
  expect(() => wordsAtCaption([], [{ op: 'trim', start: '0:04', end: '0:02' }])).toThrow();
});

test('fractional trim and speed retain boundary-word timing', () => {
  expect(wordsAtCaption([{ text: 'cut', start: 1.1, end: 1.4 }, { text: 'end', start: 2, end: 2.5 }], [
    { op: 'trim', start: '00:01.125', end: '00:02.375' }, { op: 'speed', factor: 0.5 },
  ])).toEqual([
    { text: 'cut', start: 0, end: (1.4 - 1.125) * 2 }, { text: 'end', start: 1.75, end: 2.5 },
  ]);
});

import { wordsToCues, toAss } from './captions.js';
test('caption groups do not stay on screen through a long pause', () => {
  expect(wordsToCues([{ text: 'first', start: 0, end: 0.3 }, { text: 'next', start: 3, end: 3.5 }])).toEqual([
    { text: 'first', start: 0, end: 0.3 }, { text: 'next', start: 3, end: 3.5 },
  ]);
  expect(() => wordsToCues([{ text: 'bad', start: 4, end: 2 }])).toThrow('timing');
  expect(toAss([{ text: '{\\pos(0,0)}hello', start: 0, end: 1 }], 'clean')).not.toContain('{\\pos');
});

test('3x retimes saved captions and rejects higher values', () => {
 expect(wordsAtCaption([{text:'saved',start:3,end:6}],[{op:'speed',factor:3}])).toEqual([{text:'saved',start:1,end:2}]);
 expect(()=>wordsAtCaption([],[{op:'speed',factor:3.01}])).toThrow();
});
