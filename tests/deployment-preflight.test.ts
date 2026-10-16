import { expect, test } from 'vitest';
// @ts-expect-error Plain Node entry point is also imported by the test runner.
import { deploymentErrors } from '../scripts/deployment-preflight.mjs';
const valid = {
 TF_VAR_project_id: 'takeone-prod', TF_VAR_region: 'us-central1', TF_VAR_dispatch_secret_id: 'dispatch-secret',
 TERRAFORM_STATE_BUCKET: 'takeone-state', GCP_WORKLOAD_IDENTITY_PROVIDER: 'projects/123/locations/global/workloadIdentityPools/github/providers/github',
 GCP_DEPLOY_SERVICE_ACCOUNT: 'deploy-account@takeone-prod.iam.gserviceaccount.com',
 TF_VAR_image: `us-central1-docker.pkg.dev/takeone-prod/videos/worker@sha256:${'a'.repeat(64)}`,
 TF_VAR_convex_url: 'https://example-123.convex.cloud', TF_VAR_worker_secrets: '{"WORKER_SECRET":"worker-secret"}', ACTION: 'plan',
};
test('accepts explicit project configuration and matching apply confirmation', () => {
 expect(deploymentErrors(valid)).toEqual([]);
 expect(deploymentErrors({ ...valid, ACTION: 'apply', CONFIRM_PROJECT: valid.TF_VAR_project_id })).toEqual([]);
});
test('reports missing configuration without echoing values', () => {
 expect(deploymentErrors({})).toHaveLength(10);
 const output = deploymentErrors({ ...valid, TF_VAR_worker_secrets: 'private-secret-value' }).join(' ');
 expect(output).not.toContain('private-secret-value');
 expect(output).toContain('valid JSON');
});
test('rejects cross-project images and identities, mutable tags and unsafe origins', () => {
 for (const patch of [
  { TF_VAR_image: valid.TF_VAR_image.replace('/takeone-prod/', '/wrong-project/') },
  { GCP_DEPLOY_SERVICE_ACCOUNT: 'deploy-account@wrong-project.iam.gserviceaccount.com' },
  { TF_VAR_image: 'us-central1-docker.pkg.dev/takeone-prod/videos/worker:latest' },
  { TF_VAR_convex_url: 'https://example-123.convex.cloud/path' },
  { ACTION: 'apply', CONFIRM_PROJECT: 'wrong-project' },
  { TF_VAR_worker_secrets: '[]' },
  { TF_VAR_worker_secrets: '{}' },
 ]) expect(deploymentErrors({ ...valid, ...patch }).length).toBeGreaterThan(0);
});
