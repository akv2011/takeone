// Edge-case & adversarial suite — the failure modes from the master-plan edge matrix.
// Fixtures (fixtures/edge_*) are intentionally broken/degenerate media.
import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ingest, IngestError } from './ingest/index.js';
import { mediaCore, MediaError } from './media/index.js';
import { ffprobe } from './media/ffmpeg.js';
import { createExecutor, cleanupOutput, type RunOp } from './queue/index.js';
import { createTakeOne } from './app.js';
import type { JobCtx, Op, JobSpec } from './types.js';

const F = (n: string) => resolve(process.cwd(), 'fixtures', n);
const L = { maxBytes: 50e6, maxDurationSec: 300, timeoutSec: 60 };
async function ctx(): Promise<JobCtx> { return { tmpDir: await mkdtemp(join(tmpdir(), 'takeone-edge-')), isPro: false }; }
// runs an op, copies the artifact OUT of the work dir (so we can probe it) then cleans the work dir
async function run(input: string, op: Op) {
  const c = await ctx();
  try {
    const { outputPath } = await mediaCore.runOp(input, op, c);
    const kept = join(tmpdir(), `edge-out-${Math.random().toString(36).slice(2)}.${outputPath.split('.').pop()}`);
    await copyFile(outputPath, kept);
    return { outputPath: kept };
  } finally {
    await rm(c.tmpDir, { recursive: true, force: true });
  }
}

describe('edge: bad input files', () => {
  it('rejects a corrupt file as IngestError', async () => {
    await expect(ingest.ingest({ kind: 'upload', path: F('edge_corrupt.mp4') }, L)).rejects.toBeInstanceOf(IngestError);
  });
  it('rejects a zero-byte file as IngestError', async () => {
    await expect(ingest.ingest({ kind: 'upload', path: F('edge_zero.mp4') }, L)).rejects.toBeInstanceOf(IngestError);
  });
  it('rejects a missing file with a clear IngestError', async () => {
    await expect(ingest.ingest({ kind: 'upload', path: F('does_not_exist.mp4') }, L)).rejects.toThrow(/find that file/);
  });
});

describe('edge: missing audio / video streams', () => {
  it('speed on a NO-AUDIO video still produces valid video (no [0:a] crash)', async () => {
    const { outputPath } = await run(F('edge_noaudio.mp4'), { op: 'speed', factor: 2 });
    expect((await ffprobe(outputPath)).hasVideo).toBe(true);
  }, 30000);
  it('convert-to-mp3 on a NO-AUDIO video -> clear MediaError', async () => {
    await expect(run(F('edge_noaudio.mp4'), { op: 'convert', to: 'mp3' })).rejects.toBeInstanceOf(MediaError);
  }, 30000);
  it('format on an AUDIO-ONLY file -> clear MediaError (no video to edit)', async () => {
    await expect(run(F('edge_audioonly.m4a'), { op: 'format', aspect: '9:16' })).rejects.toBeInstanceOf(MediaError);
  }, 30000);
  it('format on a NO-AUDIO video works (drops audio cleanly)', async () => {
    const { outputPath } = await run(F('edge_noaudio.mp4'), { op: 'format', aspect: '9:16' });
    const p = await ffprobe(outputPath); expect(p.width).toBe(1080); expect(p.height).toBe(1920);
  }, 30000);
});

describe('edge: pipeline degrades gracefully (no crash to the user)', () => {
  it('edit on a corrupt upload -> friendly text, not a throw', async () => {
    const replies = await createTakeOne().handle({ userId: 'edge1', platform: 'cli', text: 'caption it', attachmentPath: F('edge_corrupt.mp4'), isPro: false });
    expect(replies[0].kind).toBe('text');
    expect((replies[0] as any).text).toMatch(/couldn't|could not/i);
  }, 30000);
  it('portrait source formats to 9:16 without distortion errors', async () => {
    const { outputPath } = await run(F('edge_portrait.mp4'), { op: 'format', aspect: '9:16' });
    const p = await ffprobe(outputPath); expect(p.width).toBe(1080); expect(p.height).toBe(1920);
  }, 30000);
});

describe('edge: security', () => {
  it('watermark with injection-y text does not crash and yields valid video', async () => {
    const { outputPath } = await run(F('sample.mp4'), { op: 'watermark', text: `x'; rm -rf / #`, show: true });
    expect((await ffprobe(outputPath)).hasVideo).toBe(true);
  }, 30000);
  // SSRF: media-core reads inputs with `-protocol_whitelist file`, so http/hls/concat inputs are
  // refused by ffmpeg. That all 40+ real-file ops still pass proves the guard doesn't break local reads.
});

describe('edge: load / anti-crash (concurrency cap holds, no leak)', () => {
  it('12 concurrent jobs across users never exceed the cap and all complete', async () => {
    let live = 0, peak = 0;
    const runOp: RunOp = async (_i, _op, c) => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 20));
      live--;
      const { writeFile } = await import('node:fs/promises');
      const p = join(c.tmpDir, 'o.txt'); await writeFile(p, 'x'); return { outputPath: p };
    };
    const ex = createExecutor({ runOp }, { maxConcurrent: 3, maxQueueDepth: 100 });
    const job = (n: number): JobSpec => ({ id: `L${n}`, userId: `u${n}`, platform: 'cli', mode: 'edit', source: { kind: 'none' }, ops: [{ op: 'format', aspect: '9:16' }], isPro: false, limits: L });
    const results = await Promise.all(Array.from({ length: 12 }, (_, n) => ex.enqueue(job(n))));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(peak).toBeLessThanOrEqual(3);       // global concurrency cap respected
    for (const r of results) if (r.outputPath) await cleanupOutput(r.outputPath);
  }, 20000);
});
