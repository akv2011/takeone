import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
import { spawn } from 'node:child_process';
import { runYtDlp, pickMoments } from './moments.js';
afterEach(() => vi.clearAllMocks());
test('cancelled work never starts a subtitle process or provider call', async () => {
 const controller = new AbortController(); controller.abort();
 await expect(pickMoments({ youtubeUrl: 'https://youtu.be/abc' }, 1, controller.signal)).rejects.toThrow();
 expect(spawn).not.toHaveBeenCalled();
});
test('lease abort kills the transcript child and waits for close before rejecting', async () => {
 const child = new EventEmitter() as any;
 child.kill = vi.fn(() => { queueMicrotask(() => child.emit('close', null)); return true; });
 vi.mocked(spawn).mockReturnValue(child);
 const controller = new AbortController();
 const pending = runYtDlp(['--skip-download'], 90_000, controller.signal);
 const assertion = expect(pending).rejects.toThrow();
 controller.abort(); await assertion;
 expect(child.kill).toHaveBeenCalledWith('SIGKILL');
});
