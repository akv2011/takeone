import { expect, test, vi } from 'vitest';
import { progressReporter } from './progress.js';
test('transport errors are best effort but explicit lease rejection and cancellation stop work', async () => {
  const controller = new AbortController();
  const send = vi.fn().mockRejectedValueOnce(Error('provider secret')).mockResolvedValueOnce(false);
  const report = progressReporter(send, controller.signal);
  await expect(report('script')).resolves.toBeUndefined();
  await expect(report('narration')).rejects.toThrow('Render lease lost');
  controller.abort();
  await expect(report('saving')).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(2);
});
test('cancellation during a progress request cannot resume the renderer', async () => {
  const controller = new AbortController();
  const report = progressReporter(async () => { controller.abort(); return true; }, controller.signal);
  await expect(report('checking')).rejects.toThrow();
});
