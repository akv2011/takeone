# Managed hosting (no VM)

The website is a static build. Convex stores job state and admits at most ten jobs globally, one per account. An authenticated Cloud Run dispatcher launches a single-task Cloud Run Job for each admitted video. Jobs exit after processing; retries are managed by Convex. Telegram uses `/telegram` on the Convex HTTP domain. No long-poll bot, VM, persistent web poller, deploy key in a worker, or gcloud installation in the image is required.

The infrastructure has no default GCP project. Supply the intended TakeOne project explicitly through `project_id` or the `GCP_PROJECT_ID` GitHub environment variable. Never use the project selected in a developer's local `gcloud` configuration as an implicit deployment target. The manual `Deploy GCP` workflow plans by default and requires the exact configured project ID as confirmation before apply.

The website exposes integrations only after their complete capability gate is enabled in Convex. Keep `MANAGED_RENDERING_PAUSED=true` during migration. After staged acceptance, set `STOCK_VIDEO_ENABLED`, `YOUTUBE_INGEST_ENABLED`, `MUSIC_CATALOG_ENABLED` and `AI_VIDEO_ENABLED` independently. Telegram additionally requires its token, webhook secret, bot username and `APP_URL`. Dodo additionally requires its enable flag, environment, API key, signing secret, business ID and all three product IDs. Missing settings produce an unavailable state rather than a partially working action.

## Provisioning

1. Select the intended GCP project and region. Verify Cloud Run Jobs CPU/memory quota can run ten 2-vCPU/4-GiB tasks. Ten admitted jobs is not a promise of ten available cloud slots; run the acceptance test below.
2. Enable Artifact Registry and Cloud Build. Create a Docker repository called `takeone` in that region. Build `backend/Dockerfile` with context `backend` for `linux/amd64` and push to that repository, using Cloud Build or Docker Buildx. A local Apple Silicon build is useful for smoke tests but must not be deployed as an ARM-only image. Pin the resulting digest in `image` for releases. The build compiles TypeScript; production runs compiled JavaScript.
3. Create Secret Manager secrets and add versions outside Terraform. Generate independent random values for `WORKER_SECRET`, `DISPATCH_SECRET`, and `TELEGRAM_WEBHOOK_SECRET`. Never put values in Terraform files. Configure actual model/transcription/voice/stock API keys. The runtime calls provider APIs directly.
4. Copy `terraform.tfvars.example` to `terraform.tfvars` and replace its example resource IDs. Run `terraform init`, `terraform fmt -check`, `terraform validate`, and `terraform plan`. Review the plan, then apply when ready to deploy. State should live in an access-controlled remote backend for team use.
5. Set Convex env `WORKER_SECRET` and `DISPATCH_SECRET` to the same values as the corresponding GCP secrets. Set `DISPATCH_URL` from the Terraform output. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` (without @), and HTTPS `APP_URL` in Convex for this deployment. Verify the username against Telegram `getMe` for that token; use a separate bot and app origin for staging. The worker needs the bot token only to download Telegram source uploads; Convex delivers completed videos. No Convex administrator credential is used at runtime.
6. Deploy Convex functions, including the recovery cron, to the intended deployment, then deploy the frontend with that deployment's `VITE_CONVEX_URL`. Deploy frontend and Convex in the same maintenance window because generation inputs now include a request ID.
7. Register a Telegram webhook using Telegram `setWebhook`, with `url` set to `https://YOUR-DEPLOYMENT.convex.site/telegram`, `secret_token` set to `TELEGRAM_WEBHOOK_SECRET`, and `allowed_updates` set to `["message"]`. Store/call credentials securely, not in shell history. Stop any previous long-poll bot before registering. Users connect from the dashboard using a one-use code valid for ten minutes. Web and Telegram then share balances and job history.

## Migration and operations

- Pause submissions and drain every queued/processing legacy job before stopping the old web poller and Telegram long poller. Reconcile failed legacy jobs and restore any charged allowance manually from the original usage records; do not guess free versus paid debits. Legacy records do not store reservation types, so automatic refunds cannot reconstruct them safely. Then deploy the new Convex functions. Do not run both bridges.
- Existing paid credits and founding balances are preserved. New accounts get three lifetime free videos; new waitlist sign-ins get the badge but no extra credits. Existing users who already consumed three or more free videos receive no new free allowance.
- Old result URLs remain viewable while valid, but they cannot be refreshed or edited until their underlying GCS keys are migrated. New jobs store object keys and mint fresh fifteen-minute signed URLs.
- Worker leases last 90 seconds and heartbeat every 30 seconds. Dispatch leases last three minutes. The minute cron recovers lost work; at most three attempts precede a single refund. Request IDs make frontend retries idempotent. Cancellation is available before a worker claims the job.
- Cloud Run Job retries are zero: do not add another independent retry policy. Fenced completion rejects stale workers. Provider calls can incur costs before failure; refunds apply to user allowance, not provider invoices.
- Successful Telegram rendering and Telegram delivery are separate: Convex stores a delivery outbox, retries up to three sends, and recovers interrupted sends. Exhausted delivery failures remain visible on the job; the video is still available in the dashboard. Ambiguous Telegram responses can produce duplicate messages, but never duplicate billing or rendering.
- GCS keeps finished videos until a product retention policy is chosen. Monitor bucket growth, render duration, failure rate, age of oldest queued job, and dispatch failures. Inputs/temp files are cleaned by the worker; abandoned uploaded outputs may need an orphan retention sweep.
- For rollback, first pause submissions and allow active executions to finish. Restore compatible frontend/backend revisions together; retain the expanded schema and job data. Do not re-enable the legacy poller on the new queue.

## Dodo handoff

Catalog: `starter` $9.99/25 videos, `creator` $25/100, `pro` $99.99/500, one-time packs. The old unsigned webhook now returns 503 rather than trusting arbitrary credit amounts. Replace it only with verified raw-body signature handling and strict successful-payment event validation. Resolve credits from the server's product catalog, verify the order/account/amount/currency, and deduplicate provider payment IDs transactionally before granting credits. Never derive credit quantities from untrusted metadata. `payments:createCheckout` now creates bound hosted sessions, and signed webhooks verify canonical payment data before granting credits. It fails closed unless `DODO_CHECKOUT_ENABLED=true`. Do not enable that flag until the verified webhook and sandbox reconciliation tests are complete; no live purchase is claimed to work.

## Acceptance tests after deployment

Use a staging Convex deployment and staging provider credentials first.

1. Create ten distinct accounts with allowance and submit one job each within a short interval. Observe ten separate Cloud Run executions and overlapping `processing` timestamps. Submit an eleventh; it must wait until a slot opens. Use representative real videos, not only mocks.
2. Submit the same request ID twice; one job and one reservation must exist. Submit two jobs for one account; only one may process at once.
3. Stop one execution. Observe lease expiry, a retry with a new token, rejection of a stale completion, and eventual success. Exhaust three attempts and verify exactly one allowance refund.
4. Exercise topic generation, bare YouTube automatic clipping, explicit timestamps, portrait/square/landscape, and editing a completed video. Check actual audio, full narration, captions, framing, and output length.
5. Connect Telegram, confirm rights for a YouTube source, receive a video, and find the same job in the web gallery. Retry a webhook update and confirm no duplicate debit.
6. Open the same video after its signed URL expires; the UI must fetch a fresh URL. Another account must not fetch or edit it.
7. Run the Dodo sandbox purchase tests separately once the Dodo merchant configuration is in place.

Local tests verify queue transitions, admission, refunds, tenancy, webhook authentication, worker behavior and media operations. They do not establish production quotas, provider access, YouTube download availability, or real-world throughput.

## Optional AI scenes

Veo is opt-in through the nullable `veo` Terraform input. Leave it unset for stock-only deployment. To prepare an isolated staging project, supply an explicitly verified model and region, for example:

```hcl
# Example only: verify this model's availability and pricing for your project.
veo = {
  model  = "veo-3.0-generate-001"
  region = "us-central1"
}
```

Opt-in enables `aiplatform.googleapis.com`, grants the worker service account `roles/aiplatform.user` in the same project, and injects `VEO_PROJECT`, `VEO_REGION` and `VEO_MODEL`. Existing private-bucket object access and ADC are reused; no downloaded service-account key is needed. The Vertex AI User role covers more than Veo alone. It follows [Google's Cloud Run/Veo deployment example](https://codelabs.developers.google.com/codelabs/gemini-motion-lab/instructions); reducing it to a custom prediction role requires separate live permission testing.

Do not supply `VEO_*` through `worker_env` or `worker_secrets`; conflicting paths are rejected. This configuration supports the worker's Veo 3 regional API shape and keeps the provider project equal to the deployment project. It does not verify actual model availability, terms, quota, prices or bucket output behavior.

Keep Convex `AI_VIDEO_ENABLED` unset until an actual staging render is reviewed for video/audio quality, cost, failure handling and private output delivery. Before changing model/region or removing the opt-in, disable new AI submissions and drain/reconcile existing AI operations. Removing Terraform's API resource does not disable a previously enabled API (`disable_on_destroy=false`). No existing videos are deleted by this configuration.

Run `terraform test` for mocked opt-in/default-off and configuration-collision checks. These tests create no cloud resources. Remaining provider, IAM and cost acceptance is tracked in [the release checklist](../docs/readiness/RELEASE-ACCEPTANCE.md).

## Abandoned Convex uploads

`storageCleanup:run` is an internal mutation scheduled once per minute. Set `UPLOAD_CLEANUP_MODE` in the intended **Convex deployment**, not the worker. Default `audit` records candidates without deleting files; `off` performs no scan. `delete` removes eligible, unreferenced blobs. Files must be older than 24 hours, and every saved upload, video source reference and soundtrack source reference is protected regardless of job status. The one-hour upload finalization deadline is separate. A sweep processes at most 100 metadata rows per invocation; 24 hours is eligibility age, not a guaranteed deletion time.

Before enabling deletion in staging, run a complete audit and inspect internal `storageCleanup:status` using that deployment's Convex CLI. Confirm expected candidate counts against deliberately abandoned fixtures and confirm saved video/audio and legacy job references survive. The status exposes mode, sweep progress and scan/protection/deletion counts without filenames or storage URLs. After staging acceptance, use `delete` only for the reviewed deployment. Switching modes restarts the sweep; returning to `off` pauses further scans. No command in local validation enables production deletion.

This cleanup covers only Convex `_storage` blobs. Saved sources are retained until user removal; completed videos and archived caption files in GCS are unaffected. GCS failed-attempt/orphan retention and upload transport byte limits still need separate acceptance. If a new feature stores Convex blobs, add its indexed reference check to `storageCleanup.ts` before deployment.

### Operator health snapshot and logging

After deploying to the explicitly selected staging Convex deployment, run
`npx convex run operations:snapshot '{}'`. This is an internal query requiring
operator deployment access; it has no public HTTP route or browser API binding.
Do not append `--prod` unless you intentionally mean the production deployment.
Confirm the deployment printed by the CLI before interpreting its output.

The five-minute `operations:logHealth` cron emits one JSON log with
`event: takeone.operations`, observation timestamp, oldest queue wait, booleans,
and stable issue codes. It performs indexed first-row probes rather than scanning
or counting the job history. It exposes no user/chat/job IDs, prompts, storage
keys, video URLs, payment information or raw provider errors.

- `QUEUE_WAIT_HIGH`: the oldest queued job has waited over five minutes. Inspect
  dispatch configuration, queue admission and worker capacity; this is an initial
  operational threshold, not an advertised render-time SLA.
- `WORKER_LEASE_EXPIRED`: a dispatched/processing job has reached its lease expiry
  or has a missing legacy lease. The existing minute recovery cron owns retries
  and refunds. A condition persisting across observations requires investigation.
- `TELEGRAM_VIDEO_FAILED` / `TELEGRAM_TEXT_FAILED`: at least one persisted failed
  delivery exists. These include historical failures and are not recent failure
  rates. Inspect the corresponding delivery/recovery workflow. Do not change
  database status solely to clear an alert. Video delivery retries use the
  existing owner-authorized flow; text failures may require operator review.

For staging acceptance, seed or trigger controlled failures using test accounts,
observe both the internal snapshot and scheduled log, restore the underlying
condition and verify the flags. Configure the selected monitoring destination to
watch these events and missing observations (start with three missed five-minute
intervals). Alert routing, log export, incident acknowledgement and actual
notification delivery still require owner connections and live acceptance.
No monitoring integration or outbound notification is enabled by this code.
An empty issues array does not establish provider availability, measured latency,
ten-user execution capacity, or a successful Telegram end-to-end transaction.

### Studio frame previews and storage CORS

Studio can decode eight small frame previews in the browser on request. Preview
loading and seeking do not submit a job or consume a generation. A single
transient decoder handles the samples; cancellation, source changes and timeout
release it. Failure leaves ordinary playback/trim available. Previews are sampled
positions, not frame-index editing, and can cause additional video reads.

Set Terraform `web_origins` to the exact HTTPS origins used by your frontend,
including staging. The default is `https://takeone.web.app`; wildcards and paths
are rejected. The bucket permits
GET/HEAD CORS only and retains private access prevention. Signed URLs remain
required. This follows [Google Cloud's CORS configuration](https://cloud.google.com/storage/docs/configuring-cors).
Do not grant public bucket access to work around a failed preview. In staging,
verify previews with a fresh signed URL from each approved origin and verify
that an unapproved origin cannot read video pixels. Local same-origin decoding
and Terraform mock validation do not establish actual GCS CORS behavior.

### Webhook ingress limits

Telegram webhook bodies are limited to 64 KiB and Dodo bodies to 256 KiB of
actual streamed UTF-8 bytes, including when Content-Length is missing or false.
Body reads have a ten-second deadline. Oversize returns 413, invalid encoding or
read failure returns 400, and stalled input returns 408. Telegram secret checking
and the disabled-Dodo 503 gate occur before reading. Dodo signature processing
receives the original valid text, without normalization.

In staging, verify provider retries and normal signed payloads, and probe
oversized/chunked requests using only test endpoints and credentials. These are
application-level limits; they do not replace hosting-provider ingress controls,
rate limiting, or direct-storage upload transport limits. Local convex-test
acceptance does not establish the deployed edge runtime's behavior.

### Failed artifact upload cleanup

Worker artifact bundles use create-only GCS writes with a unique metadata marker.
When a bundle upload fails before finalization, cleanup checks only attempted
keys and deletes only matching owned object generations. The conditional delete
protects against replacement after inspection; see [GCS request preconditions](https://cloud.google.com/storage/docs/request-preconditions).
Completed bundles and uncertain completion are preserved. Aggregate
`takeone.incomplete_upload_cleanup` logs report removed, preserved and failed
counts without keys or provider errors. Cleanup is best-effort and uses the
storage client's request/retry behavior; the counts do not prove that every
orphan has been removed.

In isolated staging, interrupt the second artifact upload and verify that owned
partial objects disappear, a pre-existing colliding object survives, and no job
is marked completed with missing artifacts. Also verify retention/IAM failures
preserve objects and still reach normal retry/refund handling. No historical
bucket sweep or saved-output expiry is implemented. Forced termination, lease
loss after a successful bundle, uncertain completion and AI-provider temporary
objects still require durable orphan reconciliation.

### Stock footage downloads

B-roll and cutaway searches/downloads receive the active job's cancellation
signal. Stock downloads enforce 50 MiB of actual bytes while streaming, then
verify video metadata and atomically publish a versioned cache entry. Existing
unversioned cache files are ignored. Concurrent same-topic downloads may still
make separate provider requests, but do not expose half-written cache files.
Individual searches remain capped at 15 seconds, and download/probe work at
60 seconds, also subject to job cancellation. No stock-provider key is currently
configured locally; real provider selection, export rights and staged cancellation
still need acceptance after connection.

Production cutaway edits require footage for every effective requested window.
Missing or partially available footage fails the render and enters the existing
worker retry/refund path; it cannot complete as an unchanged source video.
Only explicit offline mode permits skipping missing cutaways. Verify this with
the real stock provider during staging, including a no-results request.

### Reaction stickers

GIPHY_API_KEY enables reaction overlays in the worker. Sticker HTTP downloads
are limited to 20 MiB actual bytes and validated as positive-duration GIF video
before atomic cache publication. Search/download deadlines are 15/30 seconds;
job cancellation interrupts both. Production requires an available effective
sticker instead of completing unchanged footage. Offline fallback is explicit.

Sticker sizing and margins now follow the source canvas, including small
landscape and square videos. Real GIPHY selection, export rights and staged
cancellation still need acceptance; synthetic local GIF tests do not establish
provider availability or licensing.

### Caption font presets

Saved caption layers support Sans, Serif and Mono in Studio. Telegram accepts
`captions clean serif` (or `sans`/`mono`) as a reply to a delivered editable video.
Omitting the font preserves the source version's choice. Initial-generation
caption defaults are unchanged. Each restyle uses one generation.

The closed preset maps use the existing container's DejaVu Sans, DejaVu Serif
and DejaVu Sans Mono. No font download or extra provider key is required. The
optional captionFont schema and worker field must be deployed together with
the frontend; the queued request identity includes the font. Validate actual
staging web and Telegram requests before enabling the new deployed UI.

### Payment review investigation

After deploying the new order indexes and internal functions to staging, use
`paymentReview:list`, `paymentReview:detail` and `paymentReview:disputes` with
operator/deployment access. These are internal queries; do not wrap them in a
public endpoint. They perform no provider requests or balance mutations.

Replace `STAGING_DEPLOYMENT` with the explicitly chosen staging deployment name.
The local CLI's `--deployment` flag was checked with `npx convex run --help`.
These examples do not deploy code:

```sh
npx convex run --deployment STAGING_DEPLOYMENT paymentReview:list '{"environment":"test","kind":"disputes","paginationOpts":{"numItems":25,"cursor":null}}'
npx convex run --deployment STAGING_DEPLOYMENT paymentReview:list '{"environment":"test","kind":"missing_session","paginationOpts":{"numItems":25,"cursor":null}}'
npx convex run --deployment STAGING_DEPLOYMENT paymentReview:list '{"environment":"test","kind":"provider_failure","paginationOpts":{"numItems":25,"cursor":null}}'
```

Queues sort by order creation time, oldest first. Each request permits 1 to 50 rows.
Use `continueCursor` as the next request's cursor until `isDone` is true. Keep
the environment and queue kind unchanged while paging. An order can appear in
more than one queue. These are stored review/error flags, not counts of all
unpaid orders or proof of current provider failure.

Use an order ID from the queue with `paymentReview:detail` (environment/orderId)
and `paymentReview:disputes` (environment/orderId/paginationOpts). Detail includes
saved payment/session references, purchase/refund amounts and credits, plus
reconciliation timestamps. Dispute pages preserve `providerAmountRaw` exactly
and label its units unverified. `observedAt` on each dispute records the saved
lookup time; the response-level timestamp records when this local view was read.
Neither is a fresh Dodo lookup or proof of provider event ordering.

Check the matching merchant environment and canonical payment/dispute state
before deciding any action. Do not clear `disputeReview`, recreate an ambiguous
checkout or edit balances merely because a row appears resolved. The confirmed
credit policy, atomic refund/dispute accounting, provider revalidation and an
authorized immutable resolution audit are still required before such actions
are implemented/enabled. Case views deliberately exclude account identities,
checkout bearer URLs and raw provider error text. These views are investigation
support, not the completed dispute-resolution workflow.

### Editable captions with reaction stickers

New planned sticker reels composite the selected GIF before the editable
caption layer. The clean archive therefore contains that exact sticker, and
caption removal/restyling preserves it without repeating a provider lookup.
Captions are drawn above the sticker when their areas overlap. The archive
allowlist still refuses provider-dependent effects after captions.

This does not retrofit editable layers into older exports. A version with no
saved clean video/timing archive still requires a new source render. Verify
actual staged delivery and subsequent caption edits on a sticker reel after
connecting GIPHY and deploying the matching worker.

### Branding on editable caption sources

New caption archives omit watermark operations explicitly marked as platform
branding. Router, soundtrack-only generation and worker finalization set this
internal marker; an ordinary creator watermark is preserved even if its text
matches the platform label. Source-embedded marks are never removed.

The stored clean intermediate remains private. Public download issuance still
selects the finished job's storageKey. Caption edit finalization applies the
reservation's entitlement: free outputs get the platform mark once; credit-funded
outputs get no added mark. This behavior applies to newly created clean archives;
previously burned branding in old archives or uploaded footage remains embedded.

### Caption-preserving ordinary edits

New ordinary Studio edits and Telegram reply edits inherit an owned source's
paired clean-video and timed-caption archive. The server derives the archive
keys and an internal `captionTransform` flag; clients cannot choose storage
keys or opt arbitrary jobs into this path. Trim, clip, speed, aspect-ratio and
supported soundtrack operations run against the clean source, saved cues are
retimed without transcription, and captions are burned once after the final
canvas transform. The resulting version receives its own private clean/timing
archive, so another ordinary edit can still be followed by caption restyling or
removal. Trimming away all spoken cues produces a valid clean export and empty
timing archive.

Free-form instructions that mention caption changes are rejected before debit
when an editable archive is available; users must use the structured caption
controls. Older jobs without a valid paired archive keep the flattened edit
path and cannot be retrofitted. Deploy the Convex schema/functions and matching
worker image together so claimed jobs and request fingerprints agree. Before
production enablement, verify an edit, a second edit and caption removal through
both authenticated Studio and Telegram against staged GCS objects. Local Linux
media tests do not establish hosted storage, delivery or concurrency behavior.

### Pause rendering during setup or migration

Set Convex `MANAGED_RENDERING_PAUSED=true` before connecting workers or reconciling legacy jobs. While paused, new reservations reject without charging, exact existing request retries retain their identity, the queue pump does not change rows or recover leases, scheduled dispatch does not send HTTP requests, and new worker claims return null after authentication. Already claimed workers can still report progress, heartbeat and complete. This is not a cancellation or refund operation and cannot recall an HTTP dispatch already in flight.

Leave the flag enabled while GCP is unconfigured and while legacy jobs without reservation records remain unresolved. Review their original usage records; do not infer historical free-versus-credit debits or reset their attempts. After the managed worker is verified and the legacy queue has been reconciled, set the flag to `false` and inspect queue health. The default is unpaused for existing configured deployments.

If the deployment itself advanced inspected legacy records to failed before the pause took effect, the internal `legacyRecovery:restorePausedFailures` mutation can correct only an explicit operator-reviewed ID batch. Save a private snapshot first. Supply each exact creation/failure timestamp and a deployment window of at most one hour. It requires pause enabled and rejects managed reservations, refunds, outputs, active leases and mismatched records; any mismatch aborts the entire batch. It restores queue visibility and retains attempts, recording the prior terminal error/time on `legacyRecovery`. It writes no balances and schedules no work. Replaying the same batch is a no-op. This does not replace original-charge reconciliation or authorize unpausing.

## Analytics and feedback summaries

Terraform creates the `takeone_analytics` BigQuery dataset in `region`, with day-partitioned `renders` and `feedback` tables, and grants `roles/bigquery.dataEditor` on that dataset only to the worker and dispatcher service accounts. Both services get `BIGQUERY_PROJECT` and `BIGQUERY_DATASET`; `worker_env` and `worker_secrets` cannot override them. Writes are best effort, so a missing grant drops rows without failing a render or a summary. The dispatcher also gets `roles/aiplatform.user` and the worker's `GEMINI_*` settings, because it calls Gemini for feedback summaries. Table columns, write behavior and ready-to-run queries are in [the analytics readiness note](../docs/readiness/analytics.md).
