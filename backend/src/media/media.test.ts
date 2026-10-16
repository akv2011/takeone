import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mediaCore } from './index.js';
import { ffprobe } from './ffmpeg.js';
import { toAss, wordsToCues, toSrt } from './captions.js';
import type { JobCtx, Op } from '../types.js';

const SAMPLE = resolve(process.cwd(), 'fixtures/sample.mp4');
async function ctx(): Promise<JobCtx> { return { tmpDir: await mkdtemp(join(tmpdir(), 'takeone-mt-')), isPro: false }; }
async function run(op: Op, input = SAMPLE) {
  const c = await ctx();
  try { return await mediaCore.runOp(input, op, c); }
  finally { /* leave tmp for probe; cleaned below */ (globalThis as any).__last = c.tmpDir; }
}

describe('media-core (real ffmpeg)', () => {
  it('format 9:16 -> 1080x1920', async () => {
    const { outputPath } = await run({ op: 'format', aspect: '9:16' });
    const p = await ffprobe(outputPath);
    expect(p.width).toBe(1080); expect(p.height).toBe(1920);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('trim 0:00-0:03 -> ~3s duration', async () => {
    const { outputPath } = await run({ op: 'trim', start: '0:00', end: '0:03' });
    const p = await ffprobe(outputPath);
    expect(p.durationSec).toBeGreaterThan(2); expect(p.durationSec).toBeLessThan(4.5);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('convert to mp3 -> audio, no video', async () => {
    const { outputPath } = await run({ op: 'convert', to: 'mp3' });
    const p = await ffprobe(outputPath);
    expect(p.hasAudio).toBe(true); expect(p.hasVideo).toBe(false);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('convert to gif -> valid image stream', async () => {
    const { outputPath } = await run({ op: 'convert', to: 'gif' });
    expect((await stat(outputPath)).size).toBeGreaterThan(0);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('speed 2x -> ~half duration', async () => {
    const { outputPath } = await run({ op: 'speed', factor: 2 });
    const p = await ffprobe(outputPath);
    expect(p.durationSec).toBeLessThan(7);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('watermark (shown) -> valid video', async () => {
    const { outputPath } = await run({ op: 'watermark', text: 'made with takeone', show: true });
    expect((await ffprobe(outputPath)).hasVideo).toBe(true);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('captions -> valid video (bar on limited build, burned on full)', async () => {
    const { outputPath } = await run({ op: 'captions', source: 'whisper', style: 'karaoke', text: 'hello world' });
    expect((await ffprobe(outputPath)).hasVideo).toBe(true);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('sticker -> gif file', async () => {
    const { outputPath } = await run({ op: 'sticker' });
    expect(outputPath.endsWith('.gif')).toBe(true);
    expect((await stat(outputPath)).size).toBeGreaterThan(0);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('thumbnail -> png', async () => {
    const { outputPath } = await run({ op: 'thumbnail', at: '0:01' });
    expect((await stat(outputPath)).size).toBeGreaterThan(0);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('voiceover (say fallback) -> audio file', async () => {
    const { outputPath } = await run({ op: 'voiceover', script: 'this is a test reel about upi' }, '');
    expect((await ffprobe(outputPath)).hasAudio).toBe(true);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('format 9:16 fit (blur-pad) -> 1080x1920', async () => {
    const { outputPath } = await run({ op: 'format', aspect: '9:16', mode: 'fit' });
    const p = await ffprobe(outputPath);
    expect(p.width).toBe(1080); expect(p.height).toBe(1920);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('format 9:16 focused crop -> 1080x1920', async () => {
    const { outputPath } = await run({ op: 'format', aspect: '9:16', mode: 'crop', focusX: 0.8 });
    const p = await ffprobe(outputPath);
    expect(p.width).toBe(1080); expect(p.height).toBe(1920);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('cutaways offline (no stock keys) -> passthrough, duration preserved', async () => {
    const before = await ffprobe(SAMPLE);
    const { outputPath } = await run({ op: 'cutaways', segments: [{ at: 2, dur: 3, keywords: ['city', 'traffic'] }] });
    const p = await ffprobe(outputPath);
    expect(p.hasVideo).toBe(true);
    expect(Math.abs(p.durationSec - before.durationSec)).toBeLessThan(1);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('title -> valid video (hook card or passthrough)', async () => {
    const { outputPath } = await run({ op: 'title', text: 'why he got fired' });
    expect((await ffprobe(outputPath)).hasVideo).toBe(true);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('zoom -> valid video, duration preserved', async () => {
    const before = await ffprobe(SAMPLE);
    const { outputPath } = await run({ op: 'zoom', windows: [{ at: 2, dur: 2 }] });
    const p = await ffprobe(outputPath);
    expect(p.hasVideo).toBe(true);
    expect(Math.abs(p.durationSec - before.durationSec)).toBeLessThan(1.5);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 60000);

  it('gifs offline (no GIPHY key) -> passthrough', async () => {
    const { outputPath } = await run({ op: 'gifs', items: [{ at: 2, dur: 3, query: 'mind blown' }] });
    expect((await ffprobe(outputPath)).hasVideo).toBe(true);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('broll -> 1080x1920 background video', async () => {
    const { outputPath } = await run({ op: 'broll', keywords: ['upi', 'india'] }, '');
    const p = await ffprobe(outputPath);
    expect(p.width).toBe(1080); expect(p.height).toBe(1920);
    await rm((globalThis as any).__last, { recursive: true, force: true });
  }, 30000);

  it('caption builders are pure/correct', () => {
    const cues = wordsToCues([{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2 }, { text: 'c', start: 2, end: 3 }, { text: 'd', start: 3, end: 4 }], 3);
    expect(cues.length).toBe(2);
    expect(toAss(cues, 'meme')).toContain('[Events]');
    expect(toSrt(cues)).toContain('-->');
  });
});
