# Managed TakeOne runtime

The backend image has two roles. It does not run a resident poller or a Telegram long-polling bot.

- **Cloud Run service:** default command `node dist/managed/server.js`. Set `DISPATCH_SECRET`, `GCP_PROJECT`, `GCP_REGION`, `CLOUD_RUN_JOB`, and `GCS_BUCKET`. `GET /healthz` is public; `POST /dispatch` and `POST /sign` require `Authorization: Bearer <DISPATCH_SECRET>`.
- **Cloud Run Job:** override command to `node dist/managed/run.js`. Set `CONVEX_URL`, `WORKER_SECRET`, `GCS_BUCKET`, provider credentials, and optionally `TELEGRAM_BOT_TOKEN`. The dispatcher supplies `TAKEONE_JOB_ID` per execution. Use one task per execution and zero platform retries: Convex owns retry and reservation policy.

Build the image with `backend/` as the Docker context. The multi-stage build compiles TypeScript, installs production dependencies, and includes ffmpeg, yt-dlp, espeak-ng, and caption fonts. The runtime executes compiled JavaScript as the unprivileged node user.

Use attached service accounts and Application Default Credentials. The dispatcher identity needs permission to run the configured job with overrides. Both identities need the bucket permissions appropriate to their roles, and permission to sign blobs for their service account so private object URLs can be signed. No deploy key or service-account JSON belongs in the image.

Store the shared dispatcher/worker secrets and provider keys in Secret Manager. Grant least-privilege secret access to their service identities. Configure a private output bucket and lifecycle deletion for expired output objects (the application stores object keys and refreshes 15-minute signed URLs on demand).

Telegram updates enter through the Convex webhook, which durably reserves quota/credits and dispatches the same worker. Convex schedules durable Telegram delivery after accepted completion, retries delivery independently, and records its status. The worker uses the bot token only to download uploaded Telegram sources. Delivery failures do not rerender the video or refund a completed generation. The completed video remains available through the application.

Root infrastructure configuration defines service/job resources and deployment steps. Deployment, public traffic changes, secret population, and bot webhook registration require the user's explicit deployment instruction.
