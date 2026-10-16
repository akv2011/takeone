import { expect, test, vi } from 'vitest';
import { handleMessage } from '../gateway/index.js';
import { renderClaim } from './pipeline.js';
import type { ClaimedJob } from './worker.js';
const job: ClaimedJob = { jobId: 'job', userId: 'user', mode: 'edit', prompt: 'Add selected soundtrack', aspect: '16:9', isPro: true, leaseToken: 'lease', music: { storageKey: 'music/upbeat.mp3', volume: 0.2, duck: true } };
test('soundtrack-only edit preserves source and avoids re-burning captions or watermark', async () => {
  const enqueue = vi.fn().mockResolvedValue({ ok: true, outputPath: '/tmp/finished.mp4' });
  const output = await renderClaim(job, new AbortController().signal, {
    source: async () => '/tmp/source.mp4', pick: vi.fn(),
    music: async () => ({ trackPath: '/tmp/approved.mp3', volume: 0.2, duck: true }),
    handle: inc => handleMessage(inc, { enqueue, data: { isPro: async () => true, incUsage: async () => 0, freeUsedToday: async () => 0 } }),
  });
  expect(output).toBe('/tmp/finished.mp4');
  expect(enqueue.mock.calls[0][0].ops).toEqual([
    { op: 'watermark', platform: true, text: 'made with takeone', show: false },
    { op: 'music', trackPath: '/tmp/approved.mp3', volume: 0.2, duck: true },
  ]);
});
test('failed soundtrack resolution cannot silently produce an unscored video', async () => {
  const handle = vi.fn();
  await expect(renderClaim(job, new AbortController().signal, { source: async () => '/tmp/source.mp4', pick: vi.fn(), handle })).rejects.toThrow('soundtrack');
  expect(handle).not.toHaveBeenCalled();
});
