import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { route } from '../router/index.js';
import { mediaCore } from './index.js';
import { ff, ffprobe } from './ffmpeg.js';

test('Studio fractional instruction renders a real cut within one source frame', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'takeone-fractional-'));
  try {
    const input = join(dir, 'source.mp4');
    await ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=3', '-c:v', 'libx264', '-c:a', 'aac', '-t', '3', input]);
    const job = await route('Trim 00:00.125 to 00:01.375', { userId: 'fixture', platform: 'web', isPro: true, mode: 'edit', attachmentPath: input });
    const trim = job.ops.find(op => op.op === 'trim')!;
    const result = await mediaCore.runOp(input, trim, { tmpDir: dir, isPro: true });
    const meta = await ffprobe(result.outputPath);
    expect(Math.abs(meta.durationSec - 1.25)).toBeLessThanOrEqual(1 / 30 + 0.005);
    expect(meta.hasAudio).toBe(true);
    expect(meta.hasVideo).toBe(true);
    await ff(['-v', 'error', '-xerror', '-i', result.outputPath, '-f', 'null', '-']);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30000);
