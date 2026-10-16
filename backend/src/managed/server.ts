import 'dotenv/config';
import { createServer } from 'node:http';
import { Storage } from '@google-cloud/storage';
import { dispatcherWithYouTube as dispatcher } from './youtubeRoutes.js';
import { workerLauncher } from './cloudRun.js';
import { summarizeFeedback } from './feedback.js';
import { insertAnalyticsRow } from '../google/bigquery.js';
function env(key: string) { const value = process.env[key]; if (!value) throw Error(`${key} required`); return value; }
const launch = workerLauncher(process.env);
const storage = new Storage(); const bucket = storage.bucket(env('GCS_BUCKET'));
const server = createServer(dispatcher({ secret: env('DISPATCH_SECRET'),
  dispatch: jobId => launch({ jobId }),
  probeUpload: uploadId => launch({ uploadId }),
  async sign(key, ttlMs = 15 * 60_000) { return (await bucket.file(key).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttlMs }))[0]; },
  summarize: request => summarizeFeedback(request.notes),
  recordFeedback: row => insertAnalyticsRow('feedback', row, line => console.warn(line)),
}));
server.requestTimeout = 35_000; server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
process.once('SIGTERM', () => server.close());
