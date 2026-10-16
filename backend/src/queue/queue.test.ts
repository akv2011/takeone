import { describe, it, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createExecutor, cleanupOutput, type RunOp } from './index.js';
import type { JobSpec, Op } from '../types.js';

const LIMITS = { maxBytes: 50e6, maxDurationSec: 300, timeoutSec: 5 };
function job(id: string, userId: string, ops: Op[], timeoutSec = 5): JobSpec {
  return { id, userId, platform: 'cli', mode: 'edit', source: { kind: 'none' }, ops, isPro: false,
    limits: { ...LIMITS, timeoutSec } };
}
const OP: Op = { op: 'format', aspect: '9:16' };

describe('queue/executor', () => {
  it('runs a 3-op job to success and produces a non-empty output', async () => {
    const runOp: RunOp = async (_in, _op, ctx) => {
      const p = join(ctx.tmpDir, 'out.txt');
      await writeFile(p, 'x');
      return { outputPath: p };
    };
    const ex = createExecutor({ runOp });
    const r = await ex.enqueue(job('j1', 'u1', [OP, OP, OP]));
    expect(r.ok).toBe(true);
    expect(r.outputPath).toBeTruthy();
    expect(r.meta!.bytes).toBeGreaterThan(0);
    await cleanupOutput(r.outputPath!);
  });

  it('serializes jobs per user — never 2 active at once for the same user', async () => {
    let concurrentForUser = 0, maxSeen = 0;
    const runOp: RunOp = async (_in, _op, ctx) => {
      concurrentForUser++; maxSeen = Math.max(maxSeen, concurrentForUser);
      await new Promise((res) => setTimeout(res, 40));
      concurrentForUser--;
      const p = join(ctx.tmpDir, 'out.txt'); await writeFile(p, 'x'); return { outputPath: p };
    };
    const ex = createExecutor({ runOp });
    const results = await Promise.all([1, 2, 3, 4].map((n) => ex.enqueue(job(`k${n}`, 'same', [OP]))));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(maxSeen).toBe(1); // per-user cap = 1 active
    for (const r of results) await cleanupOutput(r.outputPath!);
  });

  it('fails the offending op and reports failedOp on a mid-chain throw', async () => {
    let i = 0;
    const runOp: RunOp = async (_in, _op, ctx) => {
      if (i++ === 1) throw new Error('boom');
      const p = join(ctx.tmpDir, 'out.txt'); await writeFile(p, 'x'); return { outputPath: p };
    };
    const ex = createExecutor({ runOp });
    const r = await ex.enqueue(job('j2', 'u2', [OP, OP, OP]));
    expect(r.ok).toBe(false);
    expect(r.failedOp).toBe(1);
    expect(r.error).toContain('boom');
  });

  it('times out and aborts a long op', async () => {
    const runOp: RunOp = async (_in, _op, ctx) =>
      new Promise((_res, rej) => {
        const t = setTimeout(() => rej(new Error('should have been aborted')), 2000);
        ctx.signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); });
      });
    const ex = createExecutor({ runOp });
    const r = await ex.enqueue(job('j3', 'u3', [OP], 0.1));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/timed out|aborted/);
  });

  it('rejects when the queue is swamped', async () => {
    const runOp: RunOp = async (_in, _op, ctx) => {
      await new Promise((res) => setTimeout(res, 30));
      const p = join(ctx.tmpDir, 'out.txt'); await writeFile(p, 'x'); return { outputPath: p };
    };
    const ex = createExecutor({ runOp }, { maxQueueDepth: 3 });
    const ps = [1, 2, 3, 4, 5].map((n) => ex.enqueue(job(`q${n}`, `u${n}`, [OP])));
    const results = await Promise.all(ps);
    const rejected = results.filter((r) => !r.ok && /swamped/.test(r.error ?? ''));
    expect(rejected.length).toBeGreaterThan(0);
    for (const r of results) if (r.outputPath) await cleanupOutput(r.outputPath);
  });
});
