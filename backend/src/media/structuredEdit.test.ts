import { beforeAll, afterAll, expect, test, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { structuredOps, structuredJob, validateStructuredDuration } from './structuredEdit.js';
import { handleMessage } from '../gateway/index.js';
import { prepare } from '../app.js';
import { ff, ffprobe } from './ffmpeg.js';
import { mediaCore } from './index.js';
import { transformCaptionArchive } from './captionTransform.js';
let dir: string, source: string;
beforeAll(async () => {
 dir = await mkdtemp(join(tmpdir(), 'structured-edit-')); source = join(dir, 'source.mp4');
 await ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=20', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:v', 'libx264', '-c:a', 'aac', source]);
 vi.stubEnv('GEMINI_MODEL', '');
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
test('structured values bypass contradictory wording and retain free branding', async () => {
 let ops;
 await handleMessage({ userId: 'owner', platform: 'cli', mode: 'edit', attachmentPath: source, isPro: false, text: 'convert to mp3 speed 2x captions', transforms: { speed: 1.5, aspect: '1:1', fit: 'fit', trim: { start: 0.125, end: 1.625 } } }, {
  data: { isPro: async () => false, freeUsedToday: async () => 0, incUsage: async () => 1 },
  enqueue: async job => { ops = job.ops; return { ok: true, outputPath: '/fixture.mp4' }; },
 });
 expect(ops).toEqual([{ op: 'trim', start: '0.125', end: '1.625' }, { op: 'speed', factor: 1.5 }, { op: 'format', aspect: '1:1', mode: 'fit' }, { op: 'watermark', platform: true, text: 'made with takeone', show: true }]);
});
test('runtime values and source bounds fail before rendering', async () => {
 for (const input of [{ speed: NaN }, { speed: 1.1 }, { fit: 'stretch' }, { aspect: '4:3' }, { trim: { start: 0, end: Infinity } }, { trim: { start: 0.0001, end: 1 } }]) expect(() => structuredOps(input as never)).toThrow();
 expect(() => validateStructuredDuration({ speed: 0.5 }, 200)).toThrow('duration limit');
 const job = structuredJob({ trim: { start: 1, end: 3 } }, { mode: 'edit', userId: 'u', platform: 'cli', attachmentPath: source, isPro: true });
 await expect(prepare(job, { tmpDir: dir, isPro: true })).rejects.toThrow('source duration');
 await expect(prepare(job, { tmpDir: dir, isPro: true, signal: AbortSignal.abort(Error('cancelled')) })).rejects.toThrow('cancelled');
});
test.each(['9:16', '1:1', '16:9'] as const)('real trim and speed output fully decodes at %s in fit and crop modes', async aspect => {
 for (const fit of ['fit', 'crop'] as const) {
  const input = { trim: { start: 0.125, end: 1.625 }, speed: 1.5 as const, aspect, fit };
  validateStructuredDuration(input, (await ffprobe(source)).durationSec);
  let output = source;
  for (const op of structuredOps(input)) output = (await mediaCore.runOp(output, op, { tmpDir: dir, isPro: true, strictMedia: true })).outputPath;
  const meta = await ffprobe(output);
  expect(meta.videoCodec).toBe('h264'); expect(meta.audioCodec).toBe('aac');
  expect(Math.abs(meta.durationSec - 1)).toBeLessThan(0.15);
  const [width, height] = aspect.split(':').map(Number);
  expect(meta.width / meta.height).toBeCloseTo(width / height, 2);
  await ff(['-i', output, '-f', 'null', '-']);
 }
}, 60000);
test('structured archive edits retime existing cues without parsing the prompt', async () => {
 const target = { videoPath: join(dir, 'clean.mp4'), metadataPath: join(dir, 'cues.json') };
 const raw = JSON.stringify({ version: 1, style: 'clean', cues: [{ text: 'First', start: 0.1, end: 0.5 }, { text: 'Last', start: 1, end: 1.9 }] });
 const output = await transformCaptionArchive(source, raw, target, { prompt: 'convert to mp3', userId: 'u', aspect: '1:1', style: 'none', transforms: { trim: { start: 0.25, end: 1.75 }, speed: 1.5, aspect: '1:1', fit: 'fit' } }, { tmpDir: dir, isPro: true, strictMedia: true }, mediaCore.runOp);
 const archive = JSON.parse(await readFile(target.metadataPath, 'utf8'));
 expect(archive.cues).toEqual([{ text: 'First', start: 0, end: 1/6 }, { text: 'Last', start: 0.5, end: 1 }]);
 expect((await ffprobe(output)).hasAudio).toBe(true);
 await ff(['-i', output, '-f', 'null', '-']);
}, 60000);
