import { pathToFileURL } from 'node:url';

// Read configuration only. Never log values or contact a provider.
export function deploymentErrors(env) {
  const errors = [];
  const requireMatch = (name, pattern) => {
    if (!pattern.test(env[name] ?? '')) errors.push(`${name}: missing or invalid`);
  };
  requireMatch('TF_VAR_project_id', /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
  requireMatch('TF_VAR_region', /^[a-z]+-[a-z]+[0-9]+$/);
  requireMatch('TF_VAR_dispatch_secret_id', /^[A-Za-z0-9_-]{1,255}$/);
  requireMatch('TERRAFORM_STATE_BUCKET', /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/);
  requireMatch('GCP_WORKLOAD_IDENTITY_PROVIDER', /^projects\/[0-9]+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/);
  const project = env.TF_VAR_project_id;
  const image = env.TF_VAR_image ?? '';
  if (!/^[a-z0-9-]+-docker\.pkg\.dev\/[^/]+\/[^/]+\/[^@\s]+@sha256:[a-f0-9]{64}$/.test(image) || image.split('/')[1] !== project) {
    errors.push('TF_VAR_image: requires an Artifact Registry digest in the selected project');
  }
  const account = env.GCP_DEPLOY_SERVICE_ACCOUNT ?? '';
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]@[^@]+\.iam\.gserviceaccount\.com$/.test(account) || account.split('@')[1] !== `${project}.iam.gserviceaccount.com`) {
    errors.push('GCP_DEPLOY_SERVICE_ACCOUNT: requires a service account in the selected project');
  }
  if (!/^https:\/\/[a-z0-9-]+\.convex\.cloud\/?$/.test(env.TF_VAR_convex_url ?? '')) errors.push('TF_VAR_convex_url: requires a Convex cloud HTTPS origin');
  try {
    const secrets = JSON.parse(env.TF_VAR_worker_secrets ?? '');
    if (!secrets || Array.isArray(secrets) || typeof secrets !== 'object' || !secrets.WORKER_SECRET ||
      Object.entries(secrets).some(([key, value]) => !/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(value))) {
      errors.push('TF_VAR_worker_secrets: requires a secret-ID map including WORKER_SECRET');
    }
  } catch { errors.push('TF_VAR_worker_secrets: requires valid JSON'); }
  if (!['plan', 'apply'].includes(env.ACTION)) errors.push('ACTION: must be plan or apply');
  if (env.ACTION === 'apply' && (!project || env.CONFIRM_PROJECT !== project)) errors.push('CONFIRM_PROJECT: must exactly match the selected project');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = deploymentErrors(process.env);
  if (errors.length) {
    console.error(`Deployment configuration needs attention:\n${errors.map(error => `- ${error}`).join('\n')}`);
    process.exitCode = 1;
  } else console.log('Deployment configuration validated. No cloud resources were changed.');
}
