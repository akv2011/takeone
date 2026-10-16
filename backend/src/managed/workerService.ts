import 'dotenv/config';
import { createServer } from 'node:http';
import { runOnce } from './runOnce.js';
import { workerHandler } from './workerHttp.js';
for (const key of ['CONVEX_URL', 'WORKER_SECRET', 'GCS_BUCKET']) if (!process.env[key]) throw Error(`${key} required`);
const server = createServer(workerHandler(identity => runOnce(identity, process.env)));
server.requestTimeout = 30_000; server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
process.once('SIGTERM', () => server.close());
