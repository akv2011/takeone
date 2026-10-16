// Visual regression fixture. Use the Linux runtime with libass installed.
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ff, hasFilter } from '../dist/media/ffmpeg.js';
import { mediaCore } from '../dist/media/index.js';
const dir = resolve(process.argv[2] ?? 'tmp/caption-review');
await mkdir(dir, { recursive: true });
if (!await hasFilter('subtitles')) throw new Error('Visual acceptance requires libass subtitles; no placeholder permitted');
for (const [name, width, height] of [['portrait', 1080, 1920], ['square', 1080, 1080], ['landscape', 1920, 1080]]) {
  const input = join(dir, `${name}-base.mp4`);
  await ff(['-f', 'lavfi', '-i', `color=c=0x203040:s=${width}x${height}:r=25:d=1`, '-c:v', 'libx264', '-threads', '1', input]);
  const ctx = { tmpDir: dir, isPro: true, strictMedia: true };
  const title = await mediaCore.runOp(input, { op: 'title', text: 'MAKE EVERY SECOND COUNT', durationSec: 1 }, ctx);
  const result = await mediaCore.runOp(title.outputPath, { op: 'captions', source: 'script', style: 'clean', cues: [{ start: 0, end: 1, text: 'A clear message, in every format.' }] }, ctx);
  await ff(['-i', result.outputPath, '-ss', '0.5', '-frames:v', '1', join(dir, `${name}.png`)]);
}
