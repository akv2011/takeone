import { afterEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({ GoogleAuth: class { async getAccessToken() { return 'test-token'; } async getClient() { return { request }; } } }));
import { cloudRunJobRequest, cloudTasksRequest, workerLauncher } from './cloudRun.js';
describe('Cloud Run job override', () => {
  it('sets exactly the requested render or upload environment identity', () => {
    expect(cloudRunJobRequest('p', 'r', 'j', { jobId: 'job-1' })).toEqual({ method: 'POST', url: 'https://run.googleapis.com/v2/projects/p/locations/r/jobs/j:run', timeout: 30_000, data: { overrides: { containerOverrides: [{ env: [{ name: 'TAKEONE_JOB_ID', value: 'job-1' }] }], taskCount: 1 } } });
    expect(cloudRunJobRequest('p', 'r', 'j', { uploadId: 'upload-1' })).toEqual({ method: 'POST', url: 'https://run.googleapis.com/v2/projects/p/locations/r/jobs/j:run', timeout: 30_000, data: { overrides: { containerOverrides: [{ env: [{ name: 'TAKEONE_UPLOAD_ID', value: 'upload-1' }] }], taskCount: 1 } } });
  });
});
const target = { queue: 'projects/takeone-prod/locations/us-central1/queues/render', workerUrl: 'https://takeone-worker-abc123-uc.a.run.app', invoker: 'tasks-invoker@takeone-prod.iam.gserviceaccount.com' };
const tasks = { RENDER_DISPATCH: 'tasks', TASKS_QUEUE: target.queue, WORKER_SERVICE_URL: target.workerUrl, TASKS_INVOKER_SA: target.invoker };
const jobs = { GCP_PROJECT: 'takeone-prod', GCP_REGION: 'us-central1', RENDER_JOB: 'takeone-render' };
afterEach(() => { vi.unstubAllGlobals(); request.mockReset(); });
describe('Cloud Tasks request', () => {
  it('posts the identity to the worker /run with an OIDC token and no task name', () => {
    const task = (body: string) => ({ task: { dispatchDeadline: '900s', httpRequest: { httpMethod: 'POST', url: 'https://takeone-worker-abc123-uc.a.run.app/run', headers: { 'Content-Type': 'application/json' }, body, oidcToken: { serviceAccountEmail: target.invoker, audience: target.workerUrl } } } });
    const url = 'https://cloudtasks.googleapis.com/v2/projects/takeone-prod/locations/us-central1/queues/render/tasks';
    expect(cloudTasksRequest(target, { jobId: 'job-1' })).toEqual({ url, json: task('eyJqb2JJZCI6ImpvYi0xIn0=') });
    expect(cloudTasksRequest(target, { uploadId: 'upload-1' })).toEqual({ url, json: task('eyJ1cGxvYWRJZCI6InVwbG9hZC0xIn0=') });
    const decode = (identity: { jobId: string } | { uploadId: string }) => Buffer.from(cloudTasksRequest(target, identity).json.task.httpRequest.body, 'base64').toString();
    expect(decode({ jobId: 'job-1' })).toBe('{"jobId":"job-1"}'); expect(decode({ uploadId: 'upload-1' })).toBe('{"uploadId":"upload-1"}');
  });
});
describe('worker launcher', () => {
  it('starts a Cloud Run job execution by default', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await workerLauncher(jobs)({ jobId: 'job-1' });
    expect(request.mock.calls).toEqual([[cloudRunJobRequest('takeone-prod', 'us-central1', 'takeone-render', { jobId: 'job-1' })]]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('enqueues one Cloud Task in tasks mode', async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ name: 'task' })); vi.stubGlobal('fetch', fetcher);
    await workerLauncher(tasks)({ uploadId: 'upload-1' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://cloudtasks.googleapis.com/v2/projects/takeone-prod/locations/us-central1/queues/render/tasks');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual(cloudTasksRequest(target, { uploadId: 'upload-1' }).json);
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects a refused enqueue with the status and without the response body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('queue secret-detail', { status: 403 })));
    const error = await workerLauncher(tasks)({ jobId: 'job-1' }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain('403'); expect((error as Error).message).not.toContain('secret-detail');
  });
  it('fails closed on bad configuration', () => {
    expect(() => workerLauncher({ ...jobs, RENDER_DISPATCH: 'pubsub' })).toThrow('RENDER_DISPATCH must be jobs or tasks');
    const { TASKS_INVOKER_SA: _, ...noInvoker } = tasks;
    for (const environment of [{ ...tasks, WORKER_SERVICE_URL: target.workerUrl + '/' }, { ...tasks, WORKER_SERVICE_URL: 'http://takeone-worker-abc123-uc.a.run.app' }, noInvoker, { ...tasks, TASKS_QUEUE: 'projects/takeone-prod/queues/render' }])
      expect(() => workerLauncher(environment)).toThrow('Invalid Cloud Tasks configuration');
    expect(() => workerLauncher({ ...jobs, GCP_REGION: 'central' })).toThrow('Invalid Cloud Run configuration');
  });
});
