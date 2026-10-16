import { describe, it, expect, vi } from 'vitest';
import { runWorker, type WorkerDeps, type ClaimedJob } from './worker.js';
const job: ClaimedJob = { jobId: 'job1', userId: 'user1', mode: 'generate', prompt: 'a topic', aspect: '9:16', isPro: false, leaseToken: 'lease-1' };
function setup(overrides: Partial<WorkerDeps> = {}) {
  const deps: WorkerDeps = {
    claim: vi.fn(async () => job), heartbeat: vi.fn(async () => true),
    render: vi.fn(async () => '/tmp/out.mp4'), upload: vi.fn(async () => {}),
    inspect: vi.fn(async () => ({ mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true })),
    complete: vi.fn(async () => true), fail: vi.fn(async () => true),
    cleanup: vi.fn(async () => {}), deliver: vi.fn(async () => {}), log: vi.fn(), ...overrides,
  }; return deps;
}
describe('managed worker', () => {
  it('ten simultaneous duplicate runners render only the single claimed lease', async () => {
    let claimed = false;
    const deps = setup({ claim: vi.fn(async () => { if (claimed) return null; claimed = true; return job; }) });
    await Promise.all(Array.from({ length: 10 }, () => runWorker('job1', deps)));
    expect(deps.render).toHaveBeenCalledTimes(1); expect(deps.complete).toHaveBeenCalledTimes(1);
    expect(deps.upload).toHaveBeenCalledWith('/tmp/out.mp4', 'videos/job1/lease-1.mp4', expect.any(AbortSignal));
    expect(deps.cleanup).toHaveBeenCalledTimes(1);
  });
  it('fences a lost heartbeat and aborts render', async () => {
    const deps = setup({ heartbeat: vi.fn(async () => false), render: vi.fn(async (_job, signal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })); return '/tmp/out.mp4';
    }) });
    expect(await runWorker('job1', deps, 5)).toBe('lost');
    expect(deps.complete).not.toHaveBeenCalled(); expect(deps.fail).not.toHaveBeenCalled(); expect(deps.upload).not.toHaveBeenCalled(); expect(deps.cleanup).toHaveBeenCalled();
  });
  it('does not deliver if completion rejected by lease fencing', async () => {
    const deps = setup({ complete: vi.fn(async () => false) });
    expect(await runWorker('job1', deps)).toBe('lost'); expect(deps.deliver).not.toHaveBeenCalled();
  });
  it.each(['render', 'upload'] as const)('records %s failure and cleans without exposing provider errors', async (stage) => {
    const deps = setup({ [stage]: vi.fn(async () => { throw Error('secret provider key'); }) });
    expect(await runWorker('job1', deps)).toBe('failed');
    expect(deps.fail).toHaveBeenCalledWith(job, 'Rendering failed. Please try again.'); expect(deps.cleanup).toHaveBeenCalledTimes(1);
  });
  it('inspects the exact rendered output before upload and completes with its metadata', async () => {
    const deps = setup();
    expect(await runWorker('job1', deps)).toBe('completed');
    expect(deps.inspect).toHaveBeenCalledWith('/tmp/out.mp4', expect.any(AbortSignal));
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.complete).toHaveBeenCalledWith(job, 'videos/job1/lease-1.mp4', {
      mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true,
    });
    expect(vi.mocked(deps.inspect).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.upload).mock.invocationCallOrder[0]);
  });
  it('fails the lease without uploading when output inspection fails', async () => {
    const deps = setup({ inspect: vi.fn(async () => { throw Error('invalid output'); }) });
    expect(await runWorker('job1', deps)).toBe('failed');
    expect(deps.upload).not.toHaveBeenCalled(); expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledTimes(1);
  });
  it('delivery failure after success never refunds or rerenders', async () => {
    const deps = setup({ deliver: vi.fn(async () => { throw Error('telegram unavailable'); }) });
    expect(await runWorker('job1', deps)).toBe('completed'); expect(deps.fail).not.toHaveBeenCalled();
    expect(vi.mocked(deps.log).mock.calls.map(([line]) => JSON.parse(line))).toContainEqual(expect.objectContaining({ stage: 'post_completion_hook', success: false }));
  });
  it('uncertain completion does not refund an output that may already be committed', async () => {
    const deps = setup({ complete: vi.fn(async () => { throw Error('network'); }) });
    await expect(runWorker('job1', deps)).rejects.toThrow(); expect(deps.fail).not.toHaveBeenCalled(); expect(deps.cleanup).toHaveBeenCalled();
  });
});

it('a broken logger cannot turn delivery failure into a failed completed job', async () => {
 const deps = setup({ deliver: async () => { throw Error('provider secret'); }, log: () => { throw Error('logging unavailable'); } });
 expect(await runWorker('job1', deps)).toBe('completed');
 expect(deps.complete).toHaveBeenCalledTimes(1);
 expect(deps.fail).not.toHaveBeenCalled();
 expect(deps.cleanup).toHaveBeenCalledTimes(1);
});

describe('executor lease cancellation integration', () => {
 it('propagates a rejected durable heartbeat through the real app and executor to media', async () => {
   const { createTakeOne } = await import('../app.js');
   const { mkdtemp, rm } = await import('node:fs/promises');
   const { tmpdir } = await import('node:os');
   const { join } = await import('node:path');
   const dir = await mkdtemp(join(tmpdir(), 'lease-test-'));
   let mediaAborted = false;
   let markStarted!: () => void;
   const started = new Promise<void>(resolve => { markStarted = resolve; });
   const deps = setup({ heartbeat: async () => { await started; return false; }, cleanup: async () => rm(dir, { recursive: true, force: true }),
     render: async (claim, signal) => {
       const app = createTakeOne({ usePrepare: false, executor: { signal, outDir: dir },
         data: { isPro: async () => false, incUsage: async () => 0, freeUsedToday: async () => 0 },
         runOp: async (_input, _op, ctx) => {
           markStarted();
           await new Promise<void>((_resolve, reject) => {
             const abort = () => { mediaAborted = true; reject(Error('aborted')); };
             if (ctx.signal?.aborted) abort(); else ctx.signal?.addEventListener('abort', abort, { once: true });
           }); return { outputPath: '/unused.mp4' };
         },
       });
       await app.handle({ userId: claim.userId, platform: 'cli', isPro: false, mode: 'generate', text: 'test cancellation' });
       return '/unused.mp4';
     },
   });
   expect(await runWorker('job1', deps, 10)).toBe('lost'); expect(mediaAborted).toBe(true);
   expect(deps.upload).not.toHaveBeenCalled(); expect(deps.complete).not.toHaveBeenCalled(); expect(deps.fail).not.toHaveBeenCalled();
 });
 it('ten separate jobs progress independently without sharing leases or outputs', async () => {
   const deps = setup({ claim: async id => ({ ...job, jobId: id, leaseToken: `lease-${id}` }) });
   const states = await Promise.all(Array.from({ length: 10 }, (_, i) => runWorker(`job${i}`, deps)));
   expect(states.every(state => state === 'completed')).toBe(true);
   expect(new Set(vi.mocked(deps.upload).mock.calls.map(call => call[1])).size).toBe(10);
   expect(deps.complete).toHaveBeenCalledTimes(10);
 });
});

it('bounds the whole job including pre-render source downloads and records a fenced failure', async () => {
 const deps = setup({ render: async (_job, signal) => {
   await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('timeout')), { once: true }));
   return '/unused.mp4';
 } });
 expect(await runWorker('job1', deps, 1000, 5)).toBe('failed');
 expect(deps.fail).toHaveBeenCalledTimes(1); expect(deps.complete).not.toHaveBeenCalled(); expect(deps.cleanup).toHaveBeenCalled();
});

it('records saving only after render returns and before upload starts', async () => {
  const events: string[] = [];
  const deps = setup({
    render: async () => { events.push('render'); return '/tmp/out.mp4'; },
    progress: async (_job, stage) => { events.push(stage); },
    upload: async () => { events.push('upload'); },
    complete: async () => { events.push('complete'); return true; },
  });
  expect(await runWorker('job1', deps)).toBe('completed');
  expect(events).toEqual(['render', 'saving', 'upload', 'complete']);
});
