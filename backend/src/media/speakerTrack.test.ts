import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSpeakerTrack, trackExpression, renderSpeakerTrack, detectSpeakerTrack } from './speakerTrack.js';
import { ff, ffprobe } from './ffmpeg.js';
afterEach(() => vi.unstubAllEnvs());
test('tracking rejects ambiguous faces, malformed replies and unsafe crop coordinates', () => {
 for (const value of ['oops', null, {}, { focus_x: [null, 0.5] }, { focus_x: [0.3] }, { focus_x: [-1, 0.5] }, { focus_x: [0.1, 0.9] }]) expect(() => parseSpeakerTrack(value, [0, 2])).toThrow();
 expect(parseSpeakerTrack({ focus_x: [0.2, 0.7] }, [0, 2])).toEqual([{ at: 0, x: 0.2 }, { at: 2, x: 0.7 }]);
 for (const points of [[], [{ at: 0, x: 0.5 }], [{ at: 0, x: 0.5 }, { at: 0, x: 0.6 }], [{ at: 0, x: 0.5 }, { at: 61, x: 0.6 }]]) expect(() => trackExpression(points)).toThrow();
});
test('missing configuration and cancellation fail before provider use', async () => {
 vi.stubEnv('GEMINI_MODEL', '');
 await expect(detectSpeakerTrack('/unused', { tmpDir: '/tmp', isPro: true })).rejects.toThrow('configured vision');
 await expect(detectSpeakerTrack('/unused', { tmpDir: '/tmp', isPro: true, signal: AbortSignal.abort(Error('lost lease')) })).rejects.toThrow('lost lease');
});
test('real moving subject stays centered while decoded audio is unchanged', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'speaker-track-'));
 try {
  const source = join(dir, 'source.mp4'), output = join(dir, 'portrait.mp4');
  // Moving bright vertical marker represents a face center. Its position is known,
  // so this tests the actual crop interpolation independently of model quality.
  await ff(['-f', 'lavfi', '-i', "color=c=black:s=640x360:r=24:d=2,geq=lum='if(lt(abs(X-(160+160*T)),16),235,16)':cb=128:cr=128", '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
  await renderSpeakerTrack(source, output, [{ at: 0, x: 0.25 }, { at: 2, x: 0.75 }], { tmpDir: dir, isPro: true }, 360);
  const meta = await ffprobe(output); expect(meta.width / meta.height).toBeCloseTo(9 / 16, 2);
  for (const [i, at] of [0.25, 1, 1.75].entries()) {
    const raw = join(dir, `frame${i}.gray`); await ff(['-ss', String(at), '-i', output, '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', raw]);
    const pixels = await readFile(raw); let weighted = 0, mass = 0;
    for (let x = 0; x < meta.width; x++) { const brightness = pixels[Math.floor(meta.height / 2) * meta.width + x]!; if (brightness > 150) { weighted += x; mass++; } }
    expect(mass).toBeGreaterThan(5); expect(Math.abs(weighted / mass - meta.width / 2)).toBeLessThan(5);
  }
  const audios = [];
  for (const [i, file] of [source, output].entries()) { const path = join(dir, `audio${i}.pcm`); await ff(['-i', file, '-vn', '-f', 's16le', path]); audios.push(await readFile(path)); }
  expect(audios[0]).toEqual(audios[1]); await ff(['-i', output, '-f', 'null', '-']);
 } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);
