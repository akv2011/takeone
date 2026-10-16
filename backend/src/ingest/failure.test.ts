import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));
vi.mock('node:fs/promises', () => ({ stat: vi.fn(), rm: vi.fn(async () => {}) }));
vi.mock('../media/ffmpeg.js', () => ({ ffprobe: vi.fn() }));
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { ingest, IngestError } from './index.js';

test('two rejected downloads report the provider failure without a separate version preflight', async () => {
 vi.mocked(spawn).mockImplementation((_binary, args) => {
  const child = new EventEmitter() as any; child.stderr = new EventEmitter(); child.kill = vi.fn();
  queueMicrotask(() => {
   child.stderr.emit('data', Buffer.from('Video unavailable')); child.emit('close', 1);
  });
  return child;
 });
 const pending = ingest.ingest({ kind: 'youtube', url: 'https://youtu.be/fixture' }, { maxBytes: 50e6, maxDurationSec: 300, timeoutSec: 120 });
 await expect(pending).rejects.toBeInstanceOf(IngestError);
 await expect(pending).rejects.toThrow('Video unavailable');
 expect(spawn).toHaveBeenCalledTimes(2);
 expect(delay).toHaveBeenCalledOnce();
});
