import { GoogleAuth } from 'google-auth-library';
import { googleFetch } from '../google/auth.js';
export type CloudRunIdentity = { jobId: string } | { uploadId: string };
export function cloudRunJobRequest(project: string, region: string, job: string, identity: CloudRunIdentity) {
  const env = 'jobId' in identity
    ? [{ name: 'TAKEONE_JOB_ID', value: identity.jobId }]
    : [{ name: 'TAKEONE_UPLOAD_ID', value: identity.uploadId }];
  return {
    method: 'POST' as const,
    url: `https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${job}:run`,
    data: { overrides: { containerOverrides: [{ env }], taskCount: 1 } },
    timeout: 30_000,
  };
}
export interface TasksTarget { queue: string; workerUrl: string; invoker: string }
// No task name: Cloud Tasks blocks a reused task ID for up to 24 hours, so an id-derived name would drop Convex's lease-recovery and probe-retry re-dispatches.
export function cloudTasksRequest(target: TasksTarget, identity: CloudRunIdentity) {
  return {
    url: `https://cloudtasks.googleapis.com/v2/${target.queue}/tasks`,
    json: { task: { dispatchDeadline: '900s', httpRequest: { httpMethod: 'POST', url: `${target.workerUrl}/run`, headers: { 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify(identity)).toString('base64'), oidcToken: { serviceAccountEmail: target.invoker, audience: target.workerUrl } } } },
  };
}
export function workerLauncher(environment: Record<string, string | undefined>): (identity: CloudRunIdentity) => Promise<void> {
  const mode = environment.RENDER_DISPATCH?.trim() || 'jobs';
  if (mode === 'tasks') {
    const target: TasksTarget = { queue: environment.TASKS_QUEUE ?? '', workerUrl: environment.WORKER_SERVICE_URL ?? '', invoker: environment.TASKS_INVOKER_SA ?? '' };
    if (!/^projects\/[a-z][a-z0-9-]{4,61}[a-z0-9]\/locations\/[a-z]+-[a-z]+\d\/queues\/[A-Za-z0-9-]{1,100}$/.test(target.queue)
      || !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(target.workerUrl)
      || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,61}[a-z0-9]\.iam\.gserviceaccount\.com$/.test(target.invoker)) throw Error('Invalid Cloud Tasks configuration');
    return async identity => { const { url, json } = cloudTasksRequest(target, identity); await googleFetch('Cloud Tasks', url, { json, timeoutMs: 15_000 }); };
  }
  if (mode !== 'jobs') throw Error('RENDER_DISPATCH must be jobs or tasks');
  const env = (key: string) => { const value = environment[key]; if (!value) throw Error(`${key} required`); return value; };
  const project = env('GCP_PROJECT'); const region = env('GCP_REGION'); const job = env('RENDER_JOB');
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || !/^[a-z]+-[a-z]+\d$/.test(region) || !/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(job)) throw Error('Invalid Cloud Run configuration');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return async identity => {
    const client = await auth.getClient();
    await client.request(cloudRunJobRequest(project, region, job, identity));
  };
}
