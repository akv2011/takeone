import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Op } from '../types.js';
import { ff } from './ffmpeg.js';
import { mediaCore } from './index.js';
import { transformCaptionArchive } from './captionTransform.js';
let dir: string, source: string;
const raw = JSON.stringify({ version: 1, style: 'clean', cues: [{ start: 0.5, end: 1.5, text: 'First words' }, { start: 2, end: 3.5, text: 'Last words' }] });
beforeEach(async () => {
 dir = await mkdtemp(join(tmpdir(), 'caption-transform-')); source = join(dir, 'input.mp4');
 await ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '4', '-c:v', 'libx264', '-c:a', 'aac', source]);
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
const target = () => ({ videoPath: join(dir, 'clean.mp4'), metadataPath: join(dir, 'captions.json') });
const options = { userId: 'user', aspect: '1:1' as const, prompt: 'trim 00:01 to 00:04 speed 2x' };
const ctx = () => ({ tmpDir: dir, isPro: false, strictMedia: true });
test('retimes saved words through trim and speed while preserving style/font/position', async () => {
 const seen: Op[] = [];
 const run: typeof mediaCore.runOp = async (path, op, context) => {
  seen.push(op);
  // Real trim/speed/probe/archive; format and caption rendering are checked in Linux smoke.
  return op.op === 'format' || op.op === 'captions' ? { outputPath: path } : mediaCore.runOp(path, op, context);
 };
 await transformCaptionArchive(source, raw, target(), { ...options, font: 'serif', position: 'top' }, ctx(), run);
 const next = JSON.parse(await readFile(target().metadataPath, 'utf8'));
 expect(next).toEqual({ version: 1, style: 'clean', cues: [{ start: 0, end: 0.25, text: 'First words' }, { start: 0.5, end: 1.25, text: 'Last words' }] });
 expect(seen.find(op => op.op === 'captions')).toMatchObject({ style: 'clean', font: 'serif', position: 'top', cues: next.cues });
 expect(seen.find(op => op.op === 'format')).toMatchObject({ aspect: '1:1' });
 expect(seen.some(op => op.op === 'watermark')).toBe(false);
});
test('trimming to a silent interval preserves an empty editable archive without fabricated words', async () => {
 const seen: Op[] = [];
 await transformCaptionArchive(source, raw, target(), { ...options, prompt: 'trim 00:00 to 00:00.4' }, ctx(), async (path, op, context) => {
  seen.push(op); return op.op === 'format' ? { outputPath: path } : mediaCore.runOp(path, op, context);
 });
 expect(JSON.parse(await readFile(target().metadataPath, 'utf8')).cues).toEqual([]);
 expect(seen.some(op => op.op === 'captions')).toBe(false);
});
test('caption-off sources retain timing for a later restyle and do not burn text', async () => {
 const seen: Op[] = [];
 await transformCaptionArchive(source, raw, target(), { ...options, style: 'none' }, ctx(), async (path, op, context) => {
  seen.push(op); return op.op === 'format' ? { outputPath: path } : mediaCore.runOp(path, op, context);
 });
 expect(JSON.parse(await readFile(target().metadataPath, 'utf8')).cues).toHaveLength(2);
 expect(seen.some(op => op.op === 'captions')).toBe(false);
});
test('unsupported output and pre-cancellation reject before any edit operation', async () => {
 let calls = 0;
 const run: typeof mediaCore.runOp = async path => { calls++; return { outputPath: path }; };
 await expect(transformCaptionArchive(source, raw, target(), { ...options, prompt: 'convert to mp3' }, ctx(), run)).rejects.toThrow('editable MP4');
 await expect(transformCaptionArchive(source, raw, target(), options, { ...ctx(), signal: AbortSignal.abort(Error('cancelled')) }, run)).rejects.toThrow('cancelled');
 expect(calls).toBe(0);
});
