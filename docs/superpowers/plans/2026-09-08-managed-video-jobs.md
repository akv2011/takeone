# Managed video jobs implementation plan

**Goal:** Run web and Telegram generation without a VM, with ten globally admitted jobs, durable recovery, three lifetime free videos, and the requested one-time pack catalog.

**Architecture:** Convex owns admission, billing reservations, leases, and retries. A secret-authenticated Cloud Run HTTP dispatcher invokes one Cloud Run Job execution per admitted job using its service identity. Each execution claims its assigned job, heartbeats, renders, uploads to private GCS, records completion, and exits. Telegram uses a Convex HTTP webhook and the same queue. No resident runtime, deploy keys in workers, polling daemon, or gcloud subprocess is needed.

**Scope:** Replace existing hosting and bridge; preserve and test clipping/editing/stock-video generation. Actual generative-video provider selection is separate from this migration. User owns Dodo checkout/webhook implementation; retain its interface, fail closed on the insecure legacy webhook, and document integration.

**Assumptions:** Packs are one-time: $9.99/25, $25/100, $99.99/500. Free allowance is lifetime three. Existing balances are preserved; new waitlist users no longer receive extra free credits. Paid reservation controls watermark. Existing deployed VM is not destroyed by a repository migration.

## Contracts

Worker APIs in `convex/generate.ts`, all authenticated with `workerSecret` (WORKER_SECRET), not a Convex deploy key:
- claimJob({workerSecret, jobId, workerId}) -> null or {jobId,userId,mode,prompt,aspect,sourceStorageKey?,telegramFileId?,isPro,leaseToken,telegramChatId?}.
- heartbeat({workerSecret,jobId,leaseToken}) -> boolean.
- completeJob({workerSecret,jobId,leaseToken,storageKey}) -> boolean.
- failJob({workerSecret,jobId,leaseToken,error}) -> boolean. Retries at most three attempts, then refunds the original reservation exactly once.
- getDownload action({jobId}) authenticates owner, calls dispatcher POST /sign {storageKey}; returns {url}. Signed URLs are never durable state.

Dispatcher uses DISPATCH_SECRET for POST /dispatch {jobId} and /sign {storageKey}. /dispatch returns 202 after Cloud Run Jobs API accepts execution with TAKEONE_JOB_ID override. Worker env: CONVEX_URL, WORKER_SECRET, GCS_BUCKET, provider keys, optional TELEGRAM_BOT_TOKEN. Dispatcher env: GCP_PROJECT, GCP_REGION, CLOUD_RUN_JOB, DISPATCH_SECRET, GCS_BUCKET. Cloud service identities use ADC and least-privilege IAM.

## Tasks and validation

- [x] Backend runtime: test authenticated dispatcher, malformed requests, API failures; implement one-shot worker with claim fencing, heartbeat and failure handling, storage SDK and cleanup. Test duplicate claim, ten overlapping workers, expired lease, upload/render failures, mode selection and auto-clipping. Compile before dependency pruning in Docker; run compiled JS.
- [x] Durable Convex: transactional ten-slot admission and per-user one-slot limit; dispatch scheduler, lease recovery cron, fenced completion, refund accounting, input validation. Test unauthorized operations, duplicate submissions/completion, 11-job admission, retry exhaustion and recovery. Persist Telegram update deduplication and ownership confirmation; webhook immediately enqueues instead of rendering.
- [x] UI/catalog: three free and 25/100/500 paid packs; explicit aspect/mode and ownership input; owner-scoped source job editing and refreshed playback/download links. Test catalog, submission payloads and URL handling. Leave checkout provider integration to user.
- [x] Deployment configuration: Terraform for private GCS, service accounts/IAM, dispatcher and job, secret references. Replace VM/poller instructions and remove unsupported legacy runtime. Document bootstrap, secrets, webhook setup, migration and rollback.
- [x] Local integration/review: frontend build, Convex typecheck/tests, backend typecheck/build/tests, Linux container build if Docker available, Terraform validation if available. Add CI coverage. Inspect diff for tenancy, duplicate billing, stale worker writes and plaintext secrets.

Deployment acceptance (requires configured cloud/provider credentials): submit ten real jobs, confirm overlap and bounded resources, kill an execution and verify recovery/refund, exercise authenticated web and Telegram delivery, reopen expired downloads. Local tests must not be represented as proof of deployed capacity.


## Verification recorded 2026-09-08

- Frontend production build and Convex typecheck passed.
- 26 root tests passed: queue/worker integration, ten overlapping renders plus an eleventh queued account, billing/refunds/idempotency, tenancy, Telegram linking/webhook/outbox, catalog and React UI actions.
- Backend full suite: 117 tests passed in 18 files, including real FFmpeg generate/edit. Subsequent cancellation change: 5 targeted tests passed, including 2 additional tests for transcript cancellation (119 distinct backend tests exercised overall).
- Production Docker image built. Container HTTP health returned 200, unauthenticated dispatch returned 401. Network-disabled Linux real-media smoke rendered a 1080x1080 MP4 with audio and verified duration. Local image was Linux ARM64; CI builds Linux AMD64, which is the deployment target.
- Terraform 1.12.2 init, fmt check and validate passed against Google provider 7.46.1. No apply or production changes.
- Lint passed with five existing warnings; frontend emits its existing large-bundle warning.
- Spec/code review findings fixed: aspect edits preserve explicit instructions without matching timestamps; Telegram delivery now has a durable outbox; legacy queue drain/reconciliation is documented; lease cancellation reaches auto-moment subtitle processes and the model request.
- New CI covers web/Convex, Linux backend, production image health/media smoke, and Terraform validation. Remote checks have not run because nothing was pushed.

Remaining external acceptance: provision managed infrastructure and credentials, deploy to staging, validate ten real cloud executions and provider access, then schedule the production cutover. The old VM has not been deleted. Dodo integration remains user-owned and checkout/webhook fail closed until implemented. Realistic generated footage remains a separate provider feature; current Generate assembles narrated stock footage.
