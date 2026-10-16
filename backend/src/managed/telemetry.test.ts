import { expect, test, vi } from 'vitest';
import { telemetry } from './telemetry.js';
import { runWorker, type WorkerDeps } from './worker.js';
test('stage timing records failure without leaking the exception or changing its identity', async () => {
  const log = vi.fn(); const metrics = telemetry('job1', log);
  const error = new Error('secret source URL');
  await expect(metrics.time('render', async () => { throw error; })).rejects.toBe(error);
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ event: 'takeone.stage', jobId: 'job1', stage: 'render', success: false });
  expect(log.mock.calls[0][0]).not.toContain('secret');
  expect(JSON.parse(log.mock.calls[0][0]).durationMs).toBeGreaterThanOrEqual(0);
});
test('logger failure cannot fail an otherwise successful operation', async () => {
  expect(await telemetry('job1', () => { throw Error('logger offline'); }).time('render', async () => 42)).toBe(42);
});
test('worker logs queue wait, stage timings and the authoritative completion outcome', async () => {
  const log = vi.fn();
  const deps: WorkerDeps = {
    claim: async () => ({ jobId: 'job1', userId: 'u', mode: 'edit', prompt: 'private prompt', aspect: '9:16', isPro: true, leaseToken: 'lease', queueWaitMs: 125 }),
    heartbeat: async () => true, render: async () => '/private/path.mp4', inspect: async () => ({ mediaDurationMs: 1_000, mediaWidth: 1080, mediaHeight: 1920, mediaHasAudio: true }), upload: async () => {}, complete: async () => true,
    fail: async () => true, cleanup: async () => {}, deliver: async () => {}, log,
  };
  expect(await runWorker('job1', deps)).toBe('completed');
  const events = log.mock.calls.map(([line]) => JSON.parse(line));
  expect(events.find(e => e.event === 'takeone.queue_wait')).toMatchObject({ durationMs: 125 });
  expect(events.filter(e => e.event === 'takeone.stage').map(e => e.stage)).toEqual(['claim', 'render', 'inspect', 'upload', 'finalize', 'post_completion_hook', 'cleanup']);
  expect(events.at(-1)).toMatchObject({ event: 'takeone.outcome', outcome: 'completed' });
  expect(JSON.stringify(events)).not.toMatch(/private|lease/);
});
