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
