import { describe, expect, it } from 'vitest';
import { cloudRunJobRequest } from './cloudRun.js';
describe('Cloud Run job override', () => {
  it('sets exactly the requested render or upload environment identity', () => {
    expect(cloudRunJobRequest('p', 'r', 'j', { jobId: 'job-1' })).toEqual({ method: 'POST', url: 'https://run.googleapis.com/v2/projects/p/locations/r/jobs/j:run', timeout: 30_000, data: { overrides: { containerOverrides: [{ env: [{ name: 'TAKEONE_JOB_ID', value: 'job-1' }] }], taskCount: 1 } } });
    expect(cloudRunJobRequest('p', 'r', 'j', { uploadId: 'upload-1' })).toEqual({ method: 'POST', url: 'https://run.googleapis.com/v2/projects/p/locations/r/jobs/j:run', timeout: 30_000, data: { overrides: { containerOverrides: [{ env: [{ name: 'TAKEONE_UPLOAD_ID', value: 'upload-1' }] }], taskCount: 1 } } });
  });
});
