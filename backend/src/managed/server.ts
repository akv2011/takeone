import 'dotenv/config';
import { createServer } from 'node:http';
import { GoogleAuth } from 'google-auth-library';
import { Storage } from '@google-cloud/storage';
import { dispatcher } from './dispatcher.js';
import { cloudRunJobRequest } from './cloudRun.js';
function env(key: string) { const value = process.env[key]; if (!value) throw Error(`${key} required`); return value; }
const project = env('GCP_PROJECT'); const region = env('GCP_REGION'); const job = env('CLOUD_RUN_JOB');
if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || !/^[a-z]+-[a-z]+\d$/.test(region) || !/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(job)) throw Error('Invalid Cloud Run configuration');
const storage = new Storage(); const bucket = storage.bucket(env('GCS_BUCKET'));
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const server = createServer(dispatcher({ secret: env('DISPATCH_SECRET'),
  async dispatch(jobId) {
    const client = await auth.getClient();
    await client.request(cloudRunJobRequest(project, region, job, { jobId }));
  },
  async probeUpload(uploadId) {
    const client = await auth.getClient();
    await client.request(cloudRunJobRequest(project, region, job, { uploadId }));
  },
  async sign(key, ttlMs = 15 * 60_000) { return (await bucket.file(key).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttlMs }))[0]; },
}));
server.requestTimeout = 35_000; server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
process.once('SIGTERM', () => server.close());
