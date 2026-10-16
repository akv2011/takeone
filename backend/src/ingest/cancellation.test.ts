import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs/promises', () => ({ stat: vi.fn(), rm: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../media/ffmpeg.js', () => ({ ffprobe: vi.fn() }));
import { spawn } from 'node:child_process';
import { ingest } from './index.js';
const limits = { maxBytes: 50e6, maxDurationSec: 300, timeoutSec: 2 };
const source = { kind: 'youtube' as const, url: 'https://youtu.be/test' };
const children: any[] = [];
beforeEach(() => {
  vi.useFakeTimers(); children.length = 0;
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter() as any;
    child.stderr = new EventEmitter();
    child.kill = vi.fn(() => { queueMicrotask(() => child.emit('close', null)); return true; });
    children.push(child); return child;
  });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
test('already cancelled ingest never starts a download', async () => {
  const controller = new AbortController(); controller.abort();
  const pending = ingest.ingest(source, limits, { tmpDir: '/tmp', isPro: false, signal: controller.signal });
  await expect(pending).rejects.toThrow();
  expect(spawn).not.toHaveBeenCalled();
});
test('the ingest deadline includes the active download', async () => {
  let settled = false;
  const pending = ingest.ingest(source, limits).catch(error => { settled = true; return error; });
  await vi.advanceTimersByTimeAsync(2001);
  const stopped = settled;
  children[0]?.emit('close', 1);
  await pending;
  expect(stopped).toBe(true);
  expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
  expect(spawn).toHaveBeenCalledTimes(1);
});
test('cancellation interrupts retry backoff without launching another download', async () => {
  const controller = new AbortController(); let settled = false;
  const pending = ingest.ingest(source, { ...limits, timeoutSec: 30 }, { tmpDir: '/tmp', isPro: false, signal: controller.signal })
    .catch(error => { settled = true; return error; });
  children[0].emit('close', 1);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await vi.advanceTimersByTimeAsync(1);
  const stopped = settled;
  await vi.advanceTimersByTimeAsync(12000);
  await pending;
  expect(stopped).toBe(true);
  expect(spawn).toHaveBeenCalledTimes(1);
});
test('a deadline reached in retry backoff prevents the second attempt', async () => {
  const pending = ingest.ingest(source, limits);
  const assertion = expect(pending).rejects.toThrow('timed out');
  children[0].emit('close', 1);
  await vi.advanceTimersByTimeAsync(2001);
  await assertion;
  expect(spawn).toHaveBeenCalledTimes(1);
});
test('an active download is killed on cancellation and rejection waits for close', async () => {
  const controller = new AbortController(); let settled = false;
  const pending = ingest.ingest(source, limits, { tmpDir: '/tmp', isPro: false, signal: controller.signal })
    .catch(error => { settled = true; return error; });
  children[0].kill.mockImplementation(() => true);
  controller.abort();
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
  children[0].emit('close', null);
  await pending;
  expect(settled).toBe(true);
  expect(spawn).toHaveBeenCalledTimes(1);
});
