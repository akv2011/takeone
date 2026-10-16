import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWhisper, transcriber, TranscribeError } from './index.js';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('transcribe', () => {
  it('parseWhisper handles word-level json', () => {
    const { words, srt } = parseWhisper({ words: [{ word: 'hi', start: 0, end: 0.5 }, { word: 'there', start: 0.5, end: 1 }] });
    expect(words.length).toBe(2); expect(words[0].text).toBe('hi'); expect(srt).toContain('-->');
  });
  it('parseWhisper falls back to segments', () => {
    const { words } = parseWhisper({ segments: [{ text: 'a segment', start: 0, end: 2 }] });
    expect(words[0].text).toBe('a segment');
  });
  it('throws a clear error without an API key', async () => {
    const prev = process.env.WHISPER_API_KEY; delete process.env.WHISPER_API_KEY;
    await expect(transcriber.transcribe('/tmp/x.mp4')).rejects.toBeInstanceOf(TranscribeError);
    if (prev) process.env.WHISPER_API_KEY = prev;
  });
});

it.each([
 { word: '', start: 0, end: 1 }, { word: 'hello', start: 0, end: 0 },
 { word: 'hello', start: -1, end: 1 }, { word: 'hello', start: 1, end: NaN },
 { word: {}, start: 0, end: 1 }, { word: 'hello', end: 1 },
])('rejects invalid word data instead of creating blank captions: %j', word => {
 expect(() => parseWhisper({ words: [word] })).toThrow(TranscribeError);
});
it('rejects out-of-order timestamps and oversized responses', () => {
 expect(() => parseWhisper({ words: [{ word: 'first', start: 2, end: 3 }, { word: 'second', start: 1, end: 2 }] })).toThrow(TranscribeError);
 expect(() => parseWhisper({ words: Array(10001).fill({ word: 'word', start: 0, end: 1 }) })).toThrow('word limit');
});
it('pre-aborted transcription never reads or sends the file', async () => {
 const controller = new AbortController(); controller.abort(Error('lease lost'));
 const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
 await expect(transcriber.transcribe('/does-not-exist', controller.signal)).rejects.toThrow('lease lost');
 expect(fetcher).not.toHaveBeenCalled();
});
it('cancels an in-flight provider upload when the worker loses its lease', async () => {
 vi.stubEnv('WHISPER_API_KEY', 'fixture-key');
 const dir = await mkdtemp(join(tmpdir(), 'transcribe-cancel-'));
 try {
  const path = join(dir, 'transport-fixture.wav'); await writeFile(path, 'mock upload bytes');
  const controller = new AbortController();
  const fetcher = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
  vi.stubGlobal('fetch', fetcher);
  const pending = transcriber.transcribe(path, controller.signal);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  controller.abort(Error('lease lost'));
  await expect(pending).rejects.toThrow('lease lost');
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

it('preserves zero-duration Whisper words using shared-time merges and bounded display intervals', () => {
 const input = { duration: 3, words: [
  { word: 'Let', start: 0, end: 0 }, { word: 'viewers', start: 0, end: 0.4 },
  { word: 'see', start: 1, end: 1 }, { word: 'the', start: 1.1, end: 1.4 },
  { word: 'mug', start: 2.9, end: 2.9 },
 ] };
 const before = structuredClone(input);
 const result = parseWhisper(input);
 expect(result.words).toEqual([{ text: 'Let viewers', start: 0, end: 0.4 }, { text: 'see', start: 1, end: 1.1 }, { text: 'the', start: 1.1, end: 1.4 }, { text: 'mug', start: 2.9, end: 3 }]);
 expect(input).toEqual(before); expect(result.srt).toContain('Let viewers');
});
it('does not repair reversed, out-of-duration or entirely unanchored timing', () => {
 for (const words of [
  [{ word: 'wrong', start: 1, end: 0 }],
  [{ word: 'zero', start: 0, end: 0 }],
  [{ word: 'anchor', start: 0, end: 1 }, { word: 'outside', start: 3, end: 3 }],
 ]) expect(() => parseWhisper({ duration: 2, words })).toThrow(TranscribeError);
});
