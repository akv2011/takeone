import { spawn } from 'node:child_process';

const MAX_ANALYSIS_OUTPUT = 128 * 1024;

/**
 * Reject provider artifacts that are only a still or a small slideshow encoded
 * inside an MP4 container. The AI branch has no local image/GIF fallback; this
 * is the final content guard before branding and delivery.
 */
export async function assertGeneratedVideoMotion(path: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-v', 'error', '-protocol_whitelist', 'file', '-i', path,
      '-vf', 'fps=2,scale=160:-2:flags=fast_bilinear,format=gray',
      '-an', '-f', 'framemd5', '-',
    ], { signal, timeout: 30_000, killSignal: 'SIGKILL' });
    let output = '';
    let failed = false;
    const fail = (error: Error) => {
      if (failed) return;
      failed = true;
      reject(error);
    };
    child.stdout.on('data', chunk => {
      if (failed) return;
      output += String(chunk);
      if (output.length > MAX_ANALYSIS_OUTPUT) {
        child.kill('SIGKILL');
        fail(Error('AI video motion analysis exceeded its limit'));
      }
    });
    child.on('error', fail);
    child.on('close', code => {
      if (failed) return;
      if (code !== 0) { fail(Error('AI video motion analysis failed')); return; }
      const hashes = output.split('\n')
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .map(line => line.split(',').at(-1)?.trim())
        .filter((hash): hash is string => !!hash && /^[a-f0-9]{32,64}$/i.test(hash));
      const minimumUnique = Math.max(3, Math.ceil(hashes.length * 0.4));
      if (hashes.length < 6 || new Set(hashes).size < minimumUnique) {
        fail(Error('AI provider returned a static or slideshow-like result'));
        return;
      }
      resolve();
    });
  });
}
