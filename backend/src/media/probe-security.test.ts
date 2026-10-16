import { expect, test } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffprobe } from './ffmpeg.js';
test('probing an uploaded playlist cannot contact an embedded network URL', async () => {
  let requests = 0;
  const server = createServer((_req, res) => { requests++; res.writeHead(404); res.end(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = await mkdtemp(join(tmpdir(), 'takeone-probe-'));
  try {
    const port = (server.address() as { port: number }).port;
    const path = join(dir, 'disguised.mp4');
    await writeFile(path, `#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nhttp://127.0.0.1:${port}/private.ts\n#EXT-X-ENDLIST\n`);
    await expect(ffprobe(path)).rejects.toThrow();
    expect(requests).toBe(0);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});
