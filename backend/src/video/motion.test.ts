import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ff } from '../media/ffmpeg.js';
import { assertGeneratedVideoMotion } from './motion.js';

let dir: string, staticVideo: string, slideshowVideo: string, movingVideo: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'takeone-motion-gate-'));
  staticVideo = join(dir, 'static.mp4');
  slideshowVideo = join(dir, 'slideshow.mp4');
  movingVideo = join(dir, 'moving.mp4');
  await ff(['-f', 'lavfi', '-i', 'color=c=#224466:s=320x180:r=30:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', staticVideo]);
  await ff([
    '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1',
    '-f', 'lavfi', '-i', 'color=c=green:s=320x180:r=30:d=1',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=1',
    '-f', 'lavfi', '-i', 'color=c=yellow:s=320x180:r=30:d=1',
    '-filter_complex', '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]', '-map', '[v]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', slideshowVideo,
  ]);
  await ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', movingVideo]);
}, 20_000);

afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

test('accepts a decoded video with continuous frame-to-frame changes', async () => {
  await expect(assertGeneratedVideoMotion(movingVideo, new AbortController().signal)).resolves.toBeUndefined();
});

test('rejects a still image encoded inside an MP4 container', async () => {
  await expect(assertGeneratedVideoMotion(staticVideo, new AbortController().signal)).rejects.toThrow('static or slideshow-like');
});

test('rejects a pose-sheet style slideshow encoded as a video', async () => {
  await expect(assertGeneratedVideoMotion(slideshowVideo, new AbortController().signal)).rejects.toThrow('static or slideshow-like');
});

test('stops before analysis when the render lease is already cancelled', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(assertGeneratedVideoMotion(movingVideo, controller.signal)).rejects.toThrow();
});
