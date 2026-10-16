import { expect, it, vi } from 'vitest';
import { parseSpeech, transcriber, TranscribeError } from './index.js';

const recognizeSpeech = vi.hoisted(() => vi.fn());
vi.mock('../google/speech.js', () => ({ recognizeSpeech }));

const speech = (words: unknown[], resultEndOffset = '3s') => ({ results: [{ alternatives: [{ transcript: 'spoken text', words }], resultEndOffset }] });
const word = (text: string, startOffset: string, endOffset: string) => ({ word: text, startOffset, endOffset });

it('parses word timings into words and srt', () => {
  const { words, srt } = parseSpeech(speech([word('hi', '0s', '0.5s'), word('there', '0.5s', '1.250s')]));
  expect(words).toEqual([{ text: 'hi', start: 0, end: 0.5 }, { text: 'there', start: 0.5, end: 1.25 }]);
  expect(srt).toContain('-->');
});

it.each([
  word('', '0s', '1s'), word('   ', '0s', '1s'), word('hello', '0s', '0s'), word('x'.repeat(4001), '0s', '1s'),
  word('hello', '-1s', '1s'), word('hello', '0s', 'NaNs'), word('hello', '0s', '1.5'), word('hello', '0s', '1.0000000001s'),
  word('hello', '2s', '1s'), { word: 'hello', startOffset: 0, endOffset: '1s' },
  { word: {}, startOffset: '0s', endOffset: '1s' }, { word: 7, startOffset: '0s', endOffset: '1s' },
  { word: 'hello', startOffset: '0s' }, null,
])('rejects invalid word data instead of creating blank captions: %j', entry => {
  expect(() => parseSpeech(speech([entry]))).toThrow(TranscribeError);
});

it.each([null, 'text', { results: {} }, { results: [null] }, { results: [{ alternatives: {} }] }, speech({} as unknown[])])('rejects a malformed response shape: %j', json => {
  expect(() => parseSpeech(json)).toThrow('Invalid transcription response');
});

it('rejects out-of-order timestamps and oversized responses', () => {
  expect(() => parseSpeech(speech([word('first', '2s', '3s'), word('second', '1s', '2s')]))).toThrow(TranscribeError);
  expect(() => parseSpeech(speech(Array(10001).fill(word('word', '0s', '1s'))))).toThrow('word limit');
  const half = (count: number) => speech(Array(count).fill(word('word', '0s', '1s'))).results[0];
  expect(() => parseSpeech({ results: [half(5000), half(5001)] })).toThrow('word limit');
});

it('keeps words chronological across results, skips silence, and accepts a first word with no startOffset', () => {
  const json = { results: [
    { alternatives: [{ transcript: 'hello there', words: [{ word: 'hello', endOffset: '0.4s' }, word('there', '0.4s', '0.9s')] }], resultEndOffset: '1s' },
    { resultEndOffset: '4s' },
    { alternatives: [], resultEndOffset: '5s' },
    { alternatives: [{ transcript: ' ', words: [] }] },
    { alternatives: [{ transcript: 'again', words: [word('again', '5.5s', '6s')] }], resultEndOffset: '6s' },
  ] };
  expect(parseSpeech(json).words).toEqual([{ text: 'hello', start: 0, end: 0.4 }, { text: 'there', start: 0.4, end: 0.9 }, { text: 'again', start: 5.5, end: 6 }]);
  expect(parseSpeech({ results: [{ resultEndOffset: '2s' }] })).toEqual({ srt: '', words: [] });
  expect(parseSpeech({})).toEqual({ srt: '', words: [] });
});

it('rejects a later word with no startOffset and words that go back in time across results', () => {
  expect(() => parseSpeech(speech([word('first', '1s', '2s'), { word: 'second', endOffset: '3s' }]))).toThrow(TranscribeError);
  expect(() => parseSpeech({ results: [speech([word('late', '2s', '3s')]).results[0], speech([word('early', '1s', '1.5s')]).results[0]] })).toThrow(TranscribeError);
});

it('rejects transcript text that arrives without word timings', () => {
  expect(() => parseSpeech({ results: [{ alternatives: [{ transcript: 'hello' }] }] })).toThrow('Transcription is missing word timings');
  expect(() => parseSpeech(speech([]))).toThrow('Transcription is missing word timings');
});

it('preserves zero-duration words using shared-time merges and intervals bounded by the latest result end', () => {
  const input = { results: [
    { alternatives: [{ transcript: 'Let viewers see the', words: [word('Let', '0s', '0s'), word('viewers', '0s', '0.4s'), word('see', '1s', '1s'), word('the', '1.1s', '1.4s')] }], resultEndOffset: '1.5s' },
    { alternatives: [{ transcript: 'mug', words: [word('mug', '2.9s', '2.9s')] }], resultEndOffset: '3s' },
  ] };
  const before = structuredClone(input);
  const result = parseSpeech(input);
  expect(result.words).toEqual([{ text: 'Let viewers', start: 0, end: 0.4 }, { text: 'see', start: 1, end: 1.1 }, { text: 'the', start: 1.1, end: 1.4 }, { text: 'mug', start: 2.9, end: 3 }]);
  expect(input).toEqual(before); expect(result.srt).toContain('Let viewers');
});

it('does not repair reversed, out-of-duration, unanchored or duration-less timing', () => {
  for (const words of [
    [word('wrong', '1s', '0s')],
    [word('zero', '0s', '0s')],
    [word('anchor', '0s', '1s'), word('outside', '3s', '3s')],
  ]) expect(() => parseSpeech(speech(words, '2s'))).toThrow(TranscribeError);
  const zeroAfterAnchor = [word('anchor', '0s', '1s'), word('zero', '1.5s', '1.5s')];
  expect(() => parseSpeech({ results: [{ alternatives: [{ transcript: 'x', words: zeroAfterAnchor }] }] })).toThrow(TranscribeError);
  expect(() => parseSpeech(speech(zeroAfterAnchor, '0s'))).toThrow(TranscribeError);
  expect(parseSpeech(speech(zeroAfterAnchor, '2s')).words.at(-1)).toEqual({ text: 'zero', start: 1.5, end: 1.7 });
});

it('transcriber recognizes the file with the caller signal and returns parsed words', async () => {
  recognizeSpeech.mockResolvedValueOnce(speech([word('hi', '0s', '0.5s')]));
  const controller = new AbortController();
  const result = await transcriber.transcribe('/clip.mp4', controller.signal);
  expect(recognizeSpeech).toHaveBeenCalledWith('/clip.mp4', controller.signal);
  expect(result.words).toEqual([{ text: 'hi', start: 0, end: 0.5 }]);
  expect(result.srt).toContain('hi');
});

it('Japanese and Thai words come back as unspaced cue text, Latin and Korean keep spaces', () => {
  const ja = parseSpeech(speech([word('今日', '0s', '0.3s'), word('は', '0.3s', '0.5s'), word('晴れ', '0.5s', '0.9s')]));
  expect(ja.srt).toContain('\n今日は晴れ\n');
  const th = parseSpeech(speech([word('สวัสดี', '0s', '0s'), word('ครับ', '0s', '0.6s')]));
  expect(th.words).toEqual([{ text: 'สวัสดีครับ', start: 0, end: 0.6 }]);
  expect(parseSpeech(speech([word('안녕하세요', '0s', '0.5s'), word('여러분', '0.5s', '1s')])).srt).toContain('\n안녕하세요 여러분\n');
});
