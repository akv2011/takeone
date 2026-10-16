import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ff, ffprobe } from './ffmpeg.js';
export interface Brand { font: 'sans' | 'serif' | 'mono'; captionStyle: 'none' | 'clean' | 'meme' | 'karaoke'; textColor: string; outlineColor: string; logo?: number[] }
export function validateBrand(brand: Brand) {
  if (!brand || !['sans', 'serif', 'mono'].includes(brand.font) || !['none', 'clean', 'meme', 'karaoke'].includes(brand.captionStyle) || !/^#[0-9A-Fa-f]{6}$/.test(brand.textColor) || !/^#[0-9A-Fa-f]{6}$/.test(brand.outlineColor)) throw Error('Invalid brand kit');
  if (brand.logo) validatePng(brand.logo);
}
export function validatePng(logo: number[]) {
  if (!Array.isArray(logo) || logo.length < 45 || logo.length > 65536 || !logo.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) throw Error('Invalid brand logo');
  const b = Buffer.from(logo);
  if (!b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Invalid brand logo');
  let offset = 8, data = false, ended = false;
  while (offset + 12 <= b.length) {
    const length = b.readUInt32BE(offset), type = b.toString('ascii', offset + 4, offset + 8);
    if (offset + length + 12 > b.length || !['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'pHYs', 'cHRM'].includes(type)) throw Error('Invalid brand logo');
    if (offset === 8 && (type !== 'IHDR' || length !== 13 || b.readUInt32BE(16) < 1 || b.readUInt32BE(20) < 1 || b.readUInt32BE(16) > 512 || b.readUInt32BE(20) > 512)) throw Error('Invalid brand logo');
    if (type === 'IHDR' && offset !== 8) throw Error('Invalid brand logo');
    if (type === 'IDAT') data = true;
    offset += length + 12;
    if (type === 'IEND') { ended = length === 0 && offset === b.length; break; }
  }
  if (!ended || !data) throw Error('Invalid brand logo');
  return b;
}
/** Raster-only overlay on the final canvas; clean caption archives intentionally omit the logo. */
export async function applyBrandLogo(input: string, logo: number[], work: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const png = join(work, 'brand-logo.png'), safe = join(work, 'brand-logo-decoded.png'), output = join(work, 'brand-output.mp4');
  await writeFile(png, validatePng(logo), { signal });
  // Explicit codec and format prevent uploaded data selecting another decoder or protocol.
  await ff(['-f', 'image2', '-c:v', 'png', '-i', png, '-frames:v', '1', '-update', '1', safe], signal);
  const [image, video] = await Promise.all([ffprobe(safe, signal), ffprobe(input, signal)]);
  if (!image.hasVideo || image.width > 512 || image.height > 512 || !video.hasVideo) throw Error('Invalid brand logo');
  const size = Math.max(16, Math.round(Math.min(video.width, video.height) * 0.15));
  await ff(['-i', input, '-i', safe, '-filter_complex', `[1:v]scale=${size}:${size}:force_original_aspect_ratio=decrease[logo];[0:v][logo]overlay=x=W-w-W*0.04:y=H*0.04:format=auto[v]`, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', output], signal);
  return output;
}
