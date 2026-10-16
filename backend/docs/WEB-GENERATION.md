# Durable generation flow

1. Convex authenticates the user, reserves one free use or credits, records a queued job, and requests dispatch.
2. The authenticated dispatcher invokes Cloud Run Jobs with a single `TAKEONE_JOB_ID` override.
3. The worker calls `generate:claimJob` with `workerSecret`, `jobId`, and a fresh UUID `workerId`. A duplicate execution receiving `null` exits without rendering.
4. Every 30 seconds the worker renews its fenced lease with `generate:heartbeat`. A rejection or uncertain heartbeat aborts the pipeline and prevents finalization.
5. The worker honors mode/aspect and the reservation's `isPro`; a bare YouTube link selects exactly one moment and applies its edit plan. Sources stream through a hard byte limit. Local quota is bypassed through an injected data adapter, preserving free watermark behavior.
6. The single MP4 is uploaded to `videos/{jobId}/{leaseToken}.mp4`. `generate:completeJob` accepts only the current lease; the durable row stores the object key. The application asks the dispatcher to sign that key when viewing or downloading.
7. Rendering failures call fenced `generate:failJob` with a sanitized message. An uncertain completion is left to durable reconciliation because the commit may have succeeded. Stale leases, dispatch retries, reservation reconciliation, and retry limits are owned by Convex.

Per-job source/output files are removed in `finally`; executor intermediates also use a unique directory and are cleaned. Startup removes abandoned `takeone-work-*` directories older than one hour. Cloud Run Job termination discards its ephemeral filesystem. Configure bucket lifecycle rules separately for output retention.

See [DEPLOY-GCP.md](DEPLOY-GCP.md) for runtime identities and configuration. `src/cli.ts` remains a local pipeline entry point; it is not the production queue or billing system.
