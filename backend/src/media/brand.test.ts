import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { ff, ffprobe, hasFilter } from './ffmpeg.js';
import { applyBrandLogo, validateBrand, validatePng } from './brand.js';
import { toAss } from './captions.js';
import { mediaCore } from './index.js';
const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });
test('caption palette uses bounded ASS colors and bundled font without accepting filter syntax', () => {
 const text = toAss([{ start: 0, end: 1, text: 'Brand soap' }], 'clean', { width: 320, height: 320 }, undefined, 'serif', { textColor: '#12AB34', outlineColor: '#567890' });
 expect(text).toContain('DejaVu Serif'); expect(text).toContain('&H0034AB12,&H00907856');
 expect(() => toAss([], 'clean', undefined, undefined, 'sans', { textColor: 'red;movie=http://evil', outlineColor: '#000000' })).toThrow('Invalid caption color');
 expect(() => validateBrand({ font: 'arbitrary' } as never)).toThrow('Invalid brand kit');
 expect(() => validatePng(Array.from(Buffer.from('<svg/>')))).toThrow('Invalid brand logo');
});
const realRender = process.platform === 'darwin' && !await hasFilter('subtitles') ? test.skip : test;
realRender('real raster logo and green captions survive free watermark, audio and full video decode', async () => {
 const work = await mkdtemp(join(tmpdir(), 'brand-media-')); dirs.push(work);
 const source = join(work, 'source.mp4'), png = join(work, 'logo.png');
 await ff(['-f', 'lavfi', '-i', 'color=c=black:s=320x320:r=10:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
 await ff(['-f', 'lavfi', '-i', 'color=c=red:s=32x32', '-frames:v', '1', '-update', '1', png]);
 const logo = Array.from(await readFile(png)); expect(validatePng(logo).length).toBeGreaterThan(45);
 const ctx = { tmpDir: work, isPro: false, strictMedia: true, signal: new AbortController().signal };
 const captions = await mediaCore.runOp(source, { op: 'captions', source: 'script', style: 'clean', font: 'mono', colors: { textColor: '#00FF00', outlineColor: '#000000' }, cues: [{ start: 0, end: 1, text: 'SOAP BRAND' }] }, ctx);
 const watermark = await mediaCore.runOp(captions.outputPath, { op: 'watermark', platform: true, text: 'made with takeone', show: true }, ctx);
 const output = await applyBrandLogo(watermark.outputPath, logo, work, ctx.signal);
 const frame = join(work, 'frame.rgb');
 await ff(['-ss', '0.5', '-i', output, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', frame]);
 const pixels = await readFile(frame); let red = 0, green = 0, whiteBottom = 0;
 for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) { const i = (y * 320 + x) * 3, r = pixels[i], g = pixels[i+1], b = pixels[i+2]; if (x > 240 && y < 80 && r > 160 && g < 80 && b < 80) red++; if (g > 90 && g > r * 1.4 && g > b * 1.4) green++; if (y > 280 && r > 120 && g > 120 && b > 120) whiteBottom++; }
 expect(red).toBeGreaterThan(500); expect(green).toBeGreaterThan(50); expect(whiteBottom).toBeGreaterThan(10);
 const meta = await ffprobe(output); expect(meta.hasAudio).toBe(true); expect(meta.durationSec).toBeCloseTo(1, 1);
 await ff(['-i', output, '-f', 'null', '-']);
 const controller = new AbortController(); controller.abort(); await expect(applyBrandLogo(source, logo, work, controller.signal)).rejects.toThrow();
}, 60000);
