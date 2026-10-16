import { mkdtemp, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test, vi } from 'vitest';
import { ingest } from './index.js';

// Real local subprocesses stand in for yt-dlp and its encoder. No network call.
test.skipIf(process.platform === 'win32').each(['abort', 'deadline'] as const)('%s stops the downloader and its child process', async mode => {
  const work = await mkdtemp(join(tmpdir(), 'takeone-ingest-process-'));
  const marker = join(work, 'heartbeat');
  const identity = join(work, 'pid');
  const binary = join(work, 'yt-dlp');
  const oldPath = process.env.PATH;
  const controller = new AbortController();
  let parentPid: number | undefined;
  let pending: Promise<unknown> | undefined;
  try {
    const childScript = `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'x'); setInterval(() => require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'x'), 20);`;
    await writeFile(binary, `#!${process.execPath}\nif (process.argv.includes('--version')) process.exit(0);\nrequire('node:fs').writeFileSync(${JSON.stringify(identity)}, String(process.pid));\nrequire('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' });\nsetInterval(() => {}, 1000);\n`);
    await chmod(binary, 0o755);
    process.env.PATH = `${work}:${oldPath ?? ''}`;
    // Keep the deadline clock paused during OS/process startup. The child
    // processes and readiness polling remain real; only the main-process
    // deadline is advanced after the encoder is demonstrably alive.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    pending = ingest.ingest({ kind: 'youtube', url: 'https://youtu.be/test' }, { maxBytes: 50e6, maxDurationSec: 300, timeoutSec: mode === 'deadline' ? 2 : 30 }, { tmpDir: work, isPro: false, signal: controller.signal }).catch(error => error);
    const startupDeadline = performance.now() + 5000;
    let ready = false;
    while (performance.now() < startupDeadline) {
      try {
        parentPid = Number(await readFile(identity, 'utf8'));
        ready = (await readFile(marker, 'utf8')).length > 1;
      } catch { /* The real child is still starting. */ }
      if (ready) break;
      await delay(20);
    }
    expect(ready, 'The real encoder must be running before testing cancellation').toBe(true);
    const stoppedAt = Date.now();
    if (mode === 'abort') controller.abort();
    else await vi.advanceTimersByTimeAsync(2000);
    const outcome = await pending;
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(mode === 'abort' ? /abort/i : /timed out/i);
    if (mode === 'abort') expect(Date.now() - stoppedAt).toBeLessThan(2000);
    await delay(80);
    const after = await readFile(marker, 'utf8');
    await delay(160);
    expect(await readFile(marker, 'utf8')).toBe(after);
    expect(() => process.kill(parentPid!, 0)).toThrow();
  } finally {
    controller.abort();
    if (parentPid) { try { process.kill(-parentPid, 'SIGKILL'); } catch {} }
    await pending;
    vi.useRealTimers();
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    await rm(work, { recursive: true, force: true });
  }
}, 10000);
