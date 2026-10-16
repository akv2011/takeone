# Managed TakeOne runtime

The backend image has three roles. It does not run a resident poller or a Telegram long-polling bot.

- **Dispatcher service `takeone-dispatcher`.** Default command `node dist/managed/server.js`. Set `DISPATCH_SECRET`, `GCP_PROJECT`, `GCP_REGION`, `GCS_BUCKET`, and `RENDER_DISPATCH`. `RENDER_DISPATCH=tasks` also needs `TASKS_QUEUE`, `WORKER_SERVICE_URL`, and `TASKS_INVOKER_SA`. `RENDER_DISPATCH=jobs`, the default when unset, needs `RENDER_JOB`, the name of the job. `GET /healthz` is public; `POST /dispatch` and `POST /sign` require `Authorization: Bearer <DISPATCH_SECRET>`.
- **Worker service `takeone-worker`, the default render path.** Command `node dist/managed/workerService.js`. The dispatcher puts each render or upload probe on the `takeone-render` Cloud Tasks queue, and the queue calls `POST /run` with `{"jobId": "..."}` or `{"uploadId": "..."}`. Set `CONVEX_URL`, `WORKER_SECRET`, `GCS_BUCKET`, provider credentials, and optionally `TELEGRAM_BOT_TOKEN`. Each instance takes one request at a time and answers 429 while busy. Terraform runs it on gen2 with a 900 s timeout, internal ingress, 1 warm instance, and at most 8.
- **Cloud Run Job `takeone-video`, kept for rollback.** Command `node dist/managed/run.js` with the same worker environment. The dispatcher supplies `TAKEONE_JOB_ID` or `TAKEONE_UPLOAD_ID` per execution. Use one task per execution and zero platform retries.

Convex owns retry and reservation policy. The queue makes at most one delivery retry, and Convex claims fence any duplicate run.

Build the image with `backend/` as the Docker context. The multi-stage build compiles TypeScript, installs production dependencies, and includes ffmpeg, yt-dlp, espeak-ng, and caption fonts. The runtime executes compiled JavaScript as the unprivileged node user.

Use attached service accounts and Application Default Credentials. The worker service and the job share the `takeone-worker` service account. The dispatcher identity needs `roles/cloudtasks.enqueuer` on the queue and Service Account User on `takeone-tasks-invoker`, the account whose OIDC token Cloud Tasks sends to the worker. The Cloud Tasks service agent also needs Service Account User on that account, and only that account holds `roles/run.invoker` on `takeone-worker`. Keep the dispatcher's `roles/run.jobsExecutorWithOverrides` grant on the job so rollback works. Both identities need the bucket permissions appropriate to their roles, and permission to sign blobs for their service account so they can sign private object URLs. No deploy key or service-account JSON belongs in the image.

Store the shared dispatcher/worker secrets and provider keys in Secret Manager. Grant least-privilege secret access to their service identities. Configure a private output bucket and lifecycle deletion for expired output objects (the application stores object keys and refreshes 15-minute signed URLs on demand).

Telegram updates enter through the Convex webhook, which durably reserves quota/credits and dispatches the same worker. Convex schedules durable Telegram delivery after accepted completion, retries delivery independently, and records its status. The worker uses the bot token only to download uploaded Telegram sources. Delivery failures do not rerender the video or refund a completed generation. The completed video remains available through the application.

Root infrastructure configuration defines service/job resources and deployment steps. Deployment, public traffic changes, secret population, and bot webhook registration require the user's explicit deployment instruction.

## Render dispatch

Terraform `render_dispatch` picks the render path. The variable defaults to `jobs`, and production sets `render_dispatch = "tasks"` in `infra/prod.tfvars`, applied with `terraform -chdir=infra apply -var-file=prod.tfvars`. `worker_min_instances`, default 1, sets how many worker instances stay warm at the idle rate. `worker_max_instances`, 8 in production, caps both the worker instances and the queue's concurrent dispatches, so extra renders wait in the queue.

With the warm worker, production uploads are ready in about 3 s, down from 1 to 2 minutes on a cold job. Queue wait is about 0.3 s, and a full clip takes 115 s at best and 145 s at the median.

### Checks after a deploy

Set `PROJECT` to the TakeOne project ID first, so no command falls back to your local gcloud project.

1. The worker revision is Ready. `gcloud run services describe takeone-worker --project=$PROJECT --region=us-central1 --format='value(status.latestReadyRevisionName,status.latestCreatedRevisionName)'` prints the same revision twice.
2. The dispatcher runs in tasks mode. `gcloud run services describe takeone-dispatcher --project=$PROJECT --region=us-central1 --format='yaml(spec.template.spec.containers[0].env)'` shows `RENDER_DISPATCH` with value `tasks`.
3. The queue accepts work. `gcloud tasks queues describe takeone-render --project=$PROJECT --location=us-central1 --format='value(state)'` prints `RUNNING`.
4. A real run uses the worker. Upload a short video and render one clip. The `takeone-worker` logs show `upload_probe_completed` and `worker_completed`, and `gcloud run jobs executions list --job=takeone-video --project=$PROJECT --region=us-central1` shows no new execution.
5. No new failures. In Logs Explorer, query `resource.labels.service_name="takeone-worker" AND jsonPayload.event="takeone.failure"`. A failed render logs one such line. Its `error` field holds the error name and message, cut to 300 characters, with every URL replaced by `<url>` so signed links never reach the logs. The user only sees "Rendering failed. Please try again." A run that throws before it records an outcome logs `worker_failed` and returns 500, and Cloud Tasks retries it once.

### Roll back to the job

Set `render_dispatch = "jobs"` in `infra/prod.tfvars` and apply with the same command. The dispatcher then starts one `takeone-video` execution per render or upload probe, named by `RENDER_JOB`, and each run pays the job's cold start again. Terraform keeps the queue and the worker service, so tasks already queued still run on the worker, and setting `"tasks"` again switches back. The warm instance keeps billing at the idle rate until you set `worker_min_instances = 0`.

After a rollback, render one clip and confirm the execution list from check 4 shows a new `takeone-video` execution.
