import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';

it('the Storage SDK HTTP dependency sends intact multipart media with a valid boundary', async () => {
  // Resolve from Storage itself so this checks its overridden dependency, not
  // the newer HTTP client used by our direct Google Auth dependency.
  const require = createRequire(import.meta.url);
  const storageRequire = createRequire(require.resolve('@google-cloud/storage'));
  const { Gaxios } = storageRequire('gaxios');
  let contentType = '';
  let received = '';
  const server = createServer(async (req, res) => {
    contentType = req.headers['content-type'] ?? '';
    for await (const chunk of req) received += chunk.toString();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"accepted":true}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const { port } = server.address() as { port: number };
    const response = await new Gaxios().request({
      url: `http://127.0.0.1:${port}/upload`, method: 'POST',
      noProxy: ['127.0.0.1'], timeout: 5000, retry: false,
      multipart: [
        { headers: { 'Content-Type': 'application/json' }, content: '{"name":"fixture.mp4"}' },
        { headers: { 'Content-Type': 'video/mp4' }, content: 'fixture-media-bytes' },
      ],
    });
    expect(response.data).toEqual({ accepted: true });
    const boundary = contentType.match(/boundary=([a-f0-9-]+)/)?.[1];
    expect(boundary).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(received).toContain(`--${boundary}\r\n`);
    expect(received).toContain('{"name":"fixture.mp4"}');
    expect(received).toContain('fixture-media-bytes');
    expect(received).toContain(`--${boundary}--`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
