import { expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hookOp } from './hook.js';
import { ff, ffprobe, hasFilter } from './ffmpeg.js';
import { mediaCore } from './index.js';
import { transformCaptionArchive } from './captionTransform.js';
test('opening titles reject oversized and control text', () => {
 for (const value of ['', 'hi', 'x'.repeat(101), 'abc\0def']) expect(() => hookOp(value)).toThrow();
 expect(hookOp(' Good opening ')).toMatchObject({ text: 'Good opening', durationSec: 3 });
});
test('real three title exports differ at opening, preserve audio and decode; archive keeps title', async ({ skip }) => {
 if (!await hasFilter('subtitles')) { if (process.platform === 'linux') throw Error('Linux render acceptance requires libass'); skip(); }
 const dir = await mkdtemp(join(tmpdir(), 'hook-render-'));
 try {
 const source = join(dir, 'source.mp4');
 await ff(['-f', 'lavfi', '-i', 'color=c=navy:s=320x568:r=24:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
 const ctx = { tmpDir: dir, isPro: true, strictMedia: true };
 async function audio(file: string, name: string) { const path = join(dir, `${name}.pcm`); await ff(['-i', file, '-vn', '-f', 's16le', path]); return readFile(path); }
 async function frame(file: string, at: string, name: string) { const path = join(dir, `${name}.rgb`); await ff(['-ss', at, '-i', file, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', path]); return readFile(path); }
 const originalAudio = await audio(source, 'source');
 const opening: Buffer[] = [];
 for (const [i, title] of ['Why this works', 'Save time today', 'The unexpected detail'].entries()) {
  const { outputPath } = await mediaCore.runOp(source, hookOp(title), ctx);
  expect(await audio(outputPath, `audio${i}`)).toEqual(originalAudio);
  expect((await ffprobe(outputPath)).durationSec).toBeCloseTo((await ffprobe(source)).durationSec, 1);
  opening.push(await frame(outputPath, '0.6', `open${i}`));
  const late = await frame(outputPath, '3.5', `late${i}`), original = await frame(source, '3.5', `original${i}`);
  const error = late.reduce((sum, byte, j) => sum + Math.abs(byte - original[j]!), 0) / late.length;
  expect(error).toBeLessThan(2);
  await ff(['-i', outputPath, '-f', 'null', '-']);
 }
 expect(opening[0]).not.toEqual(opening[1]); expect(opening[1]).not.toEqual(opening[2]);
 const target = { videoPath: join(dir, 'clean.mp4'), metadataPath: join(dir, 'captions.json') };
 const raw = JSON.stringify({ version: 1, style: 'clean', cues: [{ start: 1, end: 2, text: 'Existing speech' }] });
 const out = await transformCaptionArchive(source, raw, target, { prompt: 'Apply opening title', hookTitle: 'Keep this title', userId: 'owner', aspect: '9:16', style: 'none' }, ctx, mediaCore.runOp);
 expect(JSON.parse(await readFile(target.metadataPath, 'utf8')).cues).toEqual(JSON.parse(raw).cues);
 expect(await audio(out, 'archive')).toEqual(originalAudio);
 expect(await frame(out, '0.6', 'archived-title')).not.toEqual(await frame(source, '0.6', 'source-open'));
 await ff(['-i', out, '-f', 'null', '-']);
 } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);
