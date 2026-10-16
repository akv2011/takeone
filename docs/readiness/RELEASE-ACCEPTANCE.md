# Release acceptance

This is the dated log of checks run against TakeOne's code, from local unit tests to live provider calls. Sections are chronological, and older pending-work lists describe their own pass. Use the status table below and the latest evidence for current status. Connection tasks are in [connections to complete](OWNER-CONNECTIONS.md).

## Status, 2026-09-22

Historical external project identifiers below are replaced with descriptive placeholders. They are not deployment targets or runnable project-specific commands.

- Every Terraform plan requires an explicit GCP project, and the manual Workload Identity deployment workflow only applies after its confirmation matches that exact project.
- One server-owned capability snapshot represents the production integrations. Unconfigured rendering, stock, YouTube, AI video, Telegram, music and Dodo actions are unavailable in the UI instead of leading users into broken workflows.
- Privacy, Terms, Acceptable Use, Copyright and Refund routes are implemented and linked from the landing page.
- An internal aggregate readiness query reports missing capability gates and active legacy jobs without returning user identifiers, prompts, provider credentials or object names.
- Managed rendering stays paused (`MANAGED_RENDERING_PAUSED=true`) until any legacy jobs are reconciled and a staging render passes.
- Firebase Authentication (Google and Anonymous providers, authorized domains) and `FIREBASE_PROJECT_ID` in Convex are required before inviting users. Deploy the Convex auth config and the web build together.

No release-ready claim is valid until the live gates below have evidence.

| Requirement | Current evidence | Remaining acceptance |
|---|---|---|
| Managed cloud hosting | Dispatcher and job code plus Terraform, with mocked plan tests | Authenticate the target GCP project, deploy isolated staging and validate the cutover |
| Real Telegram end-to-end | Local tests against a mocked Telegram API | Real requests, edits, results and billing across at least two test identities |
| Multi-user throughput and latency | Queue and worker contract tests, a ten-way synthetic local FFmpeg benchmark, and worker and Telegram API-acceptance timing instrumentation | Real cloud jobs with overlapping render execution; record queue wait, stage durations, total p50/p95, failures and cost |
| Clear onboarding | Guided first-run choices, uploads, shared allowance explanations and explicit auth, invalid-link and cancelled states | Real authenticated staging onboarding and recovery acceptance |
| Payments | Hosted sessions, signature verification, strict fulfillment, paginated history and status UI, attempt deduplication, refund ledger, verified dispute recording and review guard, internal paginated investigation queues, manual and scheduled reconciliation, paid-session response-loss recovery and checkout resumption; enablement flags off | Dispute credit holds, deductions and restoration with audited operator resolution, recovery of unknown unpaid checkout sessions, refund-policy review and real sandbox acceptance |
| Expanded editing | Uploads, sampled frame previews, visual trim with seek and mark controls, millisecond trim and bounded speed preview, initial-render caption styles, archived-source caption restyling and removal on web and Telegram, Studio wording correction, bundled font presets, top, middle and bottom caption placement, prompt edits, soundtrack mixing with ducking and fades, owner audio uploads with free preview, optional removal of all original audio, Telegram music selection and paginated version history | Frame-accurate timeline, speech-preserving music separation, freeform caption positioning, broader creator-footage QA and real cloud acceptance |
| Creator and brand output | One public Reel reviewed visually with audio muted; synthetic Linux caption renders inspected | A broader real creator and brand reference set, strong openings and pacing, licensed music listening, real footage and output QA |
| Realistic AI video | Veo 3 adapter (off), web scene selector and opt-in Terraform API, IAM and environment configuration; mocked lifecycle and infrastructure tests | Live permission and output validation, quota and cost, ambiguous-start reconciliation, real generation and creator quality QA |
| Production operations | Retry, lease and refund framework, internal operational snapshot and logging, paginated Convex orphan audit and cleanup | Observability, quotas, GCS cleanup and retention, alerting, abuse and security review, deployment and rollback validation |

## Verification rules

Record date, environment, actor/test identity, input, observed result, latency and evidence location for each end-to-end run. Local mocked infrastructure tests are separate from real media tests, local browser tests, cloud execution tests and real Telegram/payment sandbox tests. Missing connections leave their gates pending, while implementation and other tests continue.

## Local evidence, 2026-09-08, current implementation pass

- Payment implementation now creates Dodo hosted checkout sessions from configured product IDs and a server-controlled return origin. Orders snapshot the purchased pack and bind it to a user and session.
- Webhook verification uses Standard Webhooks on the raw payload, then fetches canonical payment details from Dodo. Fulfillment checks business, environment, session, product, quantity, USD amount and tax; payment credits and purchase history are recorded atomically with replay protection.
- Pricing displays pending/confirmed checkout status from an owner-scoped server query. Redirect parameters cannot grant credits. Duplicate button submissions are prevented while checkout starts.
- Root suite: **42 tests passed**; includes real cryptographic signature verification with mocked Dodo network responses, tampered/missing/stale signatures, concurrent fulfillment retries, invalid amounts/products/accounts and cross-user status access. These are **not real Dodo checkout acceptance**.
- Frontend build and Convex typecheck passed. Lint has five existing warnings; Vite reports the existing large bundle warning.
- Payment work remaining: actual sandbox checkout/browser acceptance, signed refund/dispute handling and reconciliation, checkout attempt idempotency/recovery after ambiguous provider requests, failed-payment status and purchase-history UI. Checkout must remain disabled until these acceptance gates are complete.

### Payment connection checklist

Configure in the intended Convex deployment (start with staging):

- `DODO_ENVIRONMENT=test` (use `live` only for an accepted live rollout).
- `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_BUSINESS_ID`.
- `DODO_PRODUCT_STARTER`, `DODO_PRODUCT_CREATOR`, `DODO_PRODUCT_PRO`: one-time USD products priced at $9.99, $25 and $99.99 respectively. Ensure no discounts alter the expected pack price.
- `APP_URL`: the intended frontend URL; checkout return/cancel links use this origin.
- Register `/dodo-webhook` on the Convex **HTTP actions** domain (`.convex.site`, not `.convex.cloud`) for the same deployment.
- Leave `DODO_CHECKOUT_ENABLED` unset until sandbox validation and remaining billing lifecycle work pass.

Do not put API keys, Telegram login codes or webhook secrets in this document or source control.

### Real local media and browser checks, 2026-09-08

- Backend build passed. Targeted media/timeline suites: **21 tests passed**, including real FFmpeg format, trim, speed, captions, audio extraction, GIF, voice and B-roll fixture operations. Timeline tests verify clipping boundary words and mapping subtitles through sequential trim/speed edits. This does not establish speech-recognition accuracy or production output quality.
- Replaced keyframe-based stream-copy trim with a re-encoded trim for accurate boundaries. Unsupported speed factors outside 0.5 to 2 now fail explicitly, avoiding audio/video speed disagreement.
- Browser: local Vite `http://127.0.0.1:5173/pricing`, signed-out identity, Codex in-app browser. Caught stale development-backend pack prices ($2/$5), changed UI to use the shared pack configuration, and rechecked $9.99/25, $25/100, $99.99/500.
- Browser: clicked Starter "Sign in to buy"; the TakeOne Clerk sign-in modal opened with Google and email/password options. No account login or real payment occurred. No cloud-computer test occurred.
- The local frontend and configured development backend are at different revisions. Deploy both to the same staging environment before authenticated checkout/job browser acceptance.

## Soundtrack integration, local implementation, 2026-09-08

The Studio now exposes a soundtrack picker, level control and speech ducking. Convex resolves an approved track ID into a saved catalog entry before reserving a generation. Workers download only a constrained `music/<filename>` object from the private bucket, with a 20 MB bound, and mix it using FFmpeg. Soundtrack-only edits skip reformatting and re-burning captions/watermarks. The saved job retains track attribution, displayed beside the result.

Real generated audio fixtures verify that music is quieter during a speech-frequency signal, the no-duck switch leaves the bed audible, short tracks loop, the end fades, silent videos acquire audio, and duration stays within 100 ms. These measurements do not substitute for listening to actual creator footage and real licensed music.

### Music connection required

Upload music you have licensed for downloadable creator/brand exports to the worker's private GCS bucket. Then set `MUSIC_CATALOG_JSON` in the matching Convex deployment. Example configuration (replace with your own licensed track):

```json
[
  {
    "id": "upbeat-pop",
    "label": "Upbeat pop · 110 BPM",
    "storageKey": "music/upbeat-pop.mp3",
    "attribution": "Artist credit and attribution text required by your license"
  }
]
```

Supported catalog files: MP3, WAV, M4A; maximum download size 20 MB. Track IDs are server-controlled. An empty library displays an explicit unavailable state. Do not load popular Instagram songs without export rights. Current mixing adds to the source audio; replacement/separation of an already mixed soundtrack remains an editing requirement. Web audio uploads, soundtrack preview and Telegram music selection also remain pending.

Soundtrack verification in this pass: 47 root tests passed, plus 2 new picker interaction tests after enabling `.tsx` discovery. Four targeted backend soundtrack tests passed: two decoded real-audio tests and two managed-pipeline contract tests. Invalid catalog selections are rejected before any allowance reservation. The picker tests cover selection, mix level, ducking toggle, deselection and an empty library. Typechecks/builds passed during implementation; broader backend regression results are recorded separately below. Production audio quality and hosted soundtrack delivery are still unverified.

Full backend regression: **126 tests across 22 files passed** in 62.89 seconds locally. This includes offline real-media generation/edit pipelines and the new soundtrack processing. Frontend build, backend build and Convex typecheck passed. Lint reports the same five existing warnings; the frontend bundle-size warning remains. No cloud deployment, real Telegram session or licensed-track listening acceptance was performed in this pass.

## Web upload implementation, 2026-09-08

Dashboard "Edit upload" now accepts MP4/MOV/WebM footage, shows transfer progress and cancellation, and allows reuse/removal of owned uploads. Uploading itself does not reserve a generation; submitting a render does. Rights confirmation is required. Sources are limited to 50 MB at client selection and server finalization; the media worker validates the actual duration/streams before editing (up to five minutes).

An authenticated session generates a Convex upload URL. Finalization checks actual stored metadata against the declared size/type, expiry and existing ownership attachment. Five upload sessions/hour and ten ready sources/account limit allocation; queries are indexed and bounded. Active jobs block source removal. Only the worker receives source download URLs, and accepts only its configured Convex deployment's storage endpoint without redirects. Media probing now forbids embedded network access and rejects failed probes.

Convex stores upload sources; GCS still holds finished videos and the licensed music catalog. Provider behavior: [Convex file upload flow](https://docs.convex.dev/file-storage/upload-files) and [stored file metadata](https://docs.convex.dev/file-storage/file-metadata).

Remaining upload release gates: real authenticated browser transfer against staging, real worker download/render of that source, transport-level hard size enforcement (native Convex URLs allow a larger transfer before finalization rejects it), cleanup of abandoned/unfinalized blobs, and retention settings. Local mocked storage tests explicitly add MIME metadata because convex-test omits it from stored Blob records; production MIME validation has not been weakened.

Upload verification: **63 root tests passed**, including five server upload tests, three component interaction tests and six transfer-state tests. The three UI tests were rerun after improving error messages and passed. The new real FFmpeg network-isolation test and eleven media edge tests passed; a full backend regression was also started. Frontend/backend builds and Convex typecheck passed; lint retains the five existing warnings. These results use mocked Convex storage and XHR, not a real hosted upload.

Completed upload-pass backend regression: **127 tests across 23 files passed** in 107.31 seconds locally, including real offline generation/editing and the network-isolation regression. Local runtimes varied under parallel FFmpeg load; these are not cloud latency or ten-user throughput measurements.

## Output integrity and honest production rendering, 2026-09-08

Managed workers now validate their final artifact before uploading or completing a job. Validation checks actual video streams, positive duration, configured byte/duration limits and required audio for generation. Incompatible streams are normalized to H264/yuv420p/AAC; compatible outputs avoid another encode. A full FFmpeg decode with error escalation rejects corrupt/truncated packets. Decoder diagnostics are bounded in memory. This validates deliverability, not creative quality or speech intelligibility.

The managed executor enables strict media behavior. Missing stock footage, failed voice providers and unavailable captions no longer silently yield gradients, system speech or blank caption bars. Offline CLI/test fixtures retain their explicit fallback behavior. Generated production captions transcribe the actual narration audio; timing no longer assumes evenly spoken script words. Caption groups split at long pauses, reject invalid timing and strip ASS override syntax from text.

Real output tests passed for codec normalization, compatible stream passthrough, absent required audio, exceeded limits, cancellation, corrupt bytes and a truncated fast-start MP4. Strict-render tests cover missing services. Targeted worker/narration/delivery/strict suites: 18 tests passed before the final caption grouping refinement. Cloud/provider acceptance and editorial quality review remain required.

Final output-integrity pass: backend build passed; **33 targeted tests across six files passed** after all caption refinements, including real media renders and delivery validation. The ten managed-worker tests also passed earlier in this pass. Lint retains five existing warnings. No claim of live provider, cloud or Telegram acceptance is made.

## Latency instrumentation, 2026-09-08

Managed workers emit JSON stage timings with job/run IDs and outcomes. Logs exclude prompts, source URLs, lease tokens and credentials. Timed stages are claim, render (including source handling and final validation), upload, finalize, post-completion hook and cleanup. First claims include initial queue wait measured on the Convex server; retry attempts do not mislabel prior processing time as queue wait. The post-completion hook is not Telegram delivery latency. The durable Telegram outbox still needs its own measured delivery timings.

`node scripts/summarize-latency.mjs <exported-logs.json>` reads JSON or JSONL, including Cloud Logging jsonPayload/textPayload exports. It reports nearest-rank p50/p95 for successful stages, counts failures separately, preserves uncertain finalization outcomes and deduplicates exact repeated records. These are worker-attempt metrics, not unique-user counts or end-to-end request latency.

A reproducible offline baseline is available: build the backend, then run `node backend/scripts/benchmark-local.mjs <output-directory>`. It launches ten simultaneous managed-worker calls using real FFmpeg conversion and full decode validation on a three-second synthetic fixture. Cloud services are stubbed explicitly; this cannot prove production GCP throughput, YouTube/AI latency or Telegram delivery.

Measured local result: **10/10 jobs completed**, peak ten render calls, total 27.334 seconds. Three-second 1080×1920 synthetic fixture: render + decode-validation p50 **26.708 seconds**, p95 **27.064 seconds** on Darwin/ARM64 with ten logical CPUs. Claim/upload/finalize values in this benchmark are stubs and must not be presented as service latency. Evidence: `benchmarks/2026-09-08-local.json` and matching events JSONL; sample video remains at `/tmp/takeone-local-benchmark/sample.mp4` on this machine.

Telemetry/report verification: 13 worker/telemetry tests and two latency-report tests passed. Backend build and Convex typecheck passed; lint has five existing warnings. Cloud queue waits, provider stages, Telegram delivery times, larger inputs and production concurrency remain unmeasured.

## Caption canvas and visual acceptance, 2026-09-08

Caption/title ASS files now use actual media dimensions, scaled text/outline sizes and proportional inset margins. Portrait text reserves additional space on the right. Studio previews follow the stored video aspect instead of always using a vertical frame. These margins are product choices, not a guarantee against every social application's overlay layout.

Four new canvas tests plus 25 edit-plan tests passed. Frontend/backend builds passed. The local macOS FFmpeg has no libass subtitles filter, so its old "valid video" caption tests cannot establish visible text quality. For actual visual verification, the Linux runtime was run with networking disabled and the current compiled media code mounted read-only. It rendered one-second portrait, square and landscape fixtures with strict captions; all three exported frames were visually inspected and had readable, inset text. Evidence is in `caption-review/portrait.png`, `caption-review/square.png`, and `caption-review/landscape.png`.

`backend/scripts/render-captions.mjs` reproduces the visual fixture and explicitly refuses to run without libass. The container smoke test now also burns a strict caption layer, preventing a missing subtitle filter from silently passing as a valid bar-only video. This review verifies text placement on a plain fixture; creator footage, long hooks, multiple languages and platform overlays still need output-quality acceptance.

The enhanced Linux container smoke test passed with a real 1080×1080 H264/yuv420p/AAC file and a strict subtitle burn. No production deployment was performed.

## First-use onboarding and authentication readiness, 2026-09-08

New accounts with no jobs see three concrete starting choices: edit uploaded footage, clip a permitted YouTube video, or create a narrated stock-footage video from a topic. The guide explains the three shared free videos, free uploads, per-render/edit reservations, failure refunds and one-time packs. This accurately describes the current generation implementation; realistic AI scene generation remains a separate incomplete requirement.

Account initialization failures now show a retry action. The balance stays in a loading state until the account exists, and generation is disabled during setup. Dashboard and Studio private queries wait for Convex authentication, avoiding the Clerk-sign-in/Convex-token timing race. A failed bridge gets an actionable sign-out/sign-in message rather than silently showing zero credits or requesting private data prematurely.

UI tests cover workflow selection without spending allowance, setup failure/retry, authenticated query gating and failed bridge messaging. Real Clerk onboarding and authenticated browser acceptance on the intended staging deployment remain pending.

## Billing status and history, 2026-09-08

Verified payment webhooks now handle processing, failed and cancelled states alongside success, using canonical payment lookup and order/business/environment/session binding. Older observations and late failures cannot downgrade a paid order. The user-facing pricing page displays owner-scoped checkout/purchase history, differentiates started/test checkouts from confirmed purchases, and shows tax-inclusive amounts when actual payment details are known. Pending entries show the pack price rather than implying a charge. Malformed confirmation IDs return an unavailable result instead of crashing the query.

Event names were checked against Dodo's [webhook event guide](https://docs.dodopayments.com/developer-resources/webhooks/intents/webhook-events-guide). Tests cover signed failed notifications, stale status ordering, no credits on failure, paid-state protection, cross-user history access, UI status labels, malformed IDs and tax-inclusive history.

Still incomplete: real Dodo sandbox acceptance, refund/dispute entitlement handling, checkout idempotency/recovery and automated payment reconciliation. Checkout must remain disabled until those billing release gates pass.

Final billing-history validation: **30 payment/webhook/UI tests passed**. Convex typecheck and frontend build passed; the existing bundle-size warning remains. Provider responses are mocked in these tests; no real checkout occurred.

## Checkout attempt deduplication, 2026-09-08

Hosted checkout requests now require a stable client request ID. The browser preserves one ID per pack across retries and page remounts within a tab; returning from checkout begins a new intentional purchase attempt. Server orders deduplicate per user/request and reject reuse with a different pack/product/environment. An atomic claim permits only one external session creation, and saved sessions return the same checkout URL on retry. Explicit provider rejection can release the claim; ambiguous network/5xx outcomes remain held for reconciliation instead of creating a second session.

The current provider [create-checkout documentation](https://docs.dodopayments.com/api-reference/checkout-sessions/create) did not establish a supported provider idempotency-header contract, so this implementation does not assume one. Saved session reuse is bounded to 23 hours. Automated recovery of ambiguous creations, expired-attempt UX, refunds/disputes and real sandbox acceptance remain open billing requirements. Do not enable checkout merely because retry tests pass.

Deduplication validation: 32 payment/webhook/UI tests passed, followed by 29 payment/UI tests after adding the browser retry/remount case. Convex typecheck and frontend build passed; lint retains five existing warnings. The disabled-checkout regression was updated to include the newly required request ID so it still exercises the configuration gate.

## AI scenes, local integration, 2026-09-08

The web composer has a separate eight-second AI-scene option, disabled until Convex `AI_VIDEO_ENABLED=true`. It supports portrait and landscape; square is rejected before allowance reservation. The worker calls Veo 3 with one output, audio and 720p resolution, then downloads only the result under the current job's private bucket prefix. The AI path has no image, GIF, pose-sheet or offline placeholder fallback. Before branding or delivery, a bounded decode samples the returned MP4 and rejects still or slideshow-like output that lacks enough distinct frames; an ordinary failed job follows the existing allowance refund path. Output then passes the existing watermark and full media delivery validation.

The queue persists the provider operation ID and resumes polling on worker retries. A durable start latch prevents another paid creation if the create response or operation-save result is lost. Such ambiguous starts currently fail closed and require operator reconciliation; automatic recovery is still pending. This is a tested API contract, not evidence of a successful real Veo generation.

### Connection and enablement checklist

- Choose an available Veo 3 model and region in the intended GCP project; configure the opt-in Terraform `veo` object. Terraform derives `VEO_PROJECT`, `VEO_REGION`, and `VEO_MODEL`; direct `worker_env`/secret overrides are rejected. The worker uses its attached service account via ADC; no exported service-account key is needed.
- Apply the opt-in Terraform configuration that enables the Vertex AI API, grants the worker `roles/aiplatform.user`, and derives the provider environment in the same project. Confirm live model availability, quota and private output-bucket behavior in isolated staging before enabling the feature.
- Check generation quotas for ten overlapping requests and measure actual billed cost. Current pack credits have not been validated against Veo costs; do not enable paid AI scenes until entitlement/pricing is settled.
- Run actual scene generation, content-filter failure, worker interruption/resumption, audio/video review and private output access tests. Keep `AI_VIDEO_ENABLED` unset until these gates pass.
- Telegram AI-mode selection, multi-scene composition and automatic ambiguous-start reconciliation remain pending.

API contract reference: [Google video generation documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-text). No paid model request was made during local tests.

Validation for this pass: backend build and Convex typecheck passed; eight Veo adapter tests and fourteen combined queue/UI tests passed. Tests cover saved-operation resumption, one-shot starts, stale leases, invalid/foreign outputs, provider failures, cancellation before submission, disabled-mode allowance protection and square-format prevention. Frontend production build passed with the existing bundle-size warning. Provider responses are mocked; no real AI output or deployed-cloud acceptance is claimed.

## Studio timeline controls, local implementation, 2026-09-08

Added explicit start/end controls in whole seconds and speed choices (0.5×, 1×, 1.5×, 2×). The browser previews the selected range without creating a job, pauses at the end and restores normal playback speed. Applying creates one normal credit-reserved edit against the owned current output; the existing job request deduplication remains in use. The interface states the one-generation cost before submission. Range controls reject empty, reversed, fractional and out-of-duration selections. These controls currently support whole seconds up to 300 seconds; frame-accurate dragging, timeline thumbnails and persistent version navigation remain pending.

The deterministic renderer instruction retains the chosen trim/speed and does not request another caption burn. Existing captions are part of the source picture and move with its frames. Real browser acceptance on staging and creator-footage review are still required.

Validation: five timeline-control tests and thirteen Studio/general UI tests passed, including player seek/rate/pause events and the exact owned-source request. Ten router tests and four subtitle timeline tests passed. Two targeted real FFmpeg tests passed for trim duration and speed duration (sixteen unrelated media tests skipped in this targeted run). Frontend build passed with the existing bundle-size warning. DOM playback tests simulate media events; they do not prove actual browser decoding or cloud delivery.

## Persistent edit versions, local implementation, 2026-09-08

New edits record both their parent job and original root job. An owner-scoped indexed query returns the original and fifty most recent edits, including failed/queued branches. Studio history links update the route, so a reload opens the selected version. Opening an earlier completed version obtains its signed video URL without a debit; applying a further edit creates a separate branch using the existing one-generation reservation. Failed edits retain navigation back to completed versions.

Existing historical edits without ancestry fields are treated as separate originals; this change does not guess lineage from filenames or mutate historical production data. A migration can be evaluated separately if older history is needed. The history panel is currently bounded to fifty recent edits plus the original; pagination beyond this remains pending. Real authenticated staging browser acceptance remains required.

Verification after version history: frontend build and Convex typecheck passed; the full application suite passed **88 tests in 16 files**, and the full backend suite passed **151 tests in 28 files**. Backend evidence includes real FFmpeg media operations, output codec/decode checks and soundtrack signal tests; generation integration fixtures use offline providers. These passes do not validate hosted services, real voice/model quality, Dodo sandbox purchases or ten real cloud users.

### First direct Reel reference observation

Opened [Samuel S's public Reel](https://www.instagram.com/reel/C-YV0nYtWK0/) in the local in-app browser on 2026-09-08, signed out; dismissed its signup prompt. Inspected two frames from playback: a portrait sunset shot with centered thin white narration text, a heavier CTA and yellow keyword emphasis; another frame uses an archival landscape video/page inside the portrait canvas. These observations support testing text hierarchy, selective keyword emphasis and deliberate framing of archival inserts. The page dates the post to August 2024, so this is a craft reference, not evidence of a current trend. Audio was muted; no music or beat-sync quality claim is made. Broader creator/brand reference review and side-by-side rendered output review remain required. The temporary tab was closed; no media was downloaded or reused.

## Telegram soundtrack selection, local implementation, 2026-09-08

Linked Telegram users can browse the shared approved catalog with `/music` and `/music list PAGE`, select `/music TRACK_ID [LEVEL_PERCENT]`, or disable with `/music off`. Selection persists only on the linked account, defaults to 20% volume and enables speech ducking. Replies explain that selection is free, rendering reserves one generation, the choice applies to future videos and existing source audio remains. Each submitted job snapshots the approved track and attribution through the existing queue validator. Missing/removed tracks require reselection before any reservation. Catalog pages contain at most ten tracks to stay within Telegram message limits.

Unknown slash commands and unsupported empty-text attachments now return help without starting a paid generation. Previously, a sticker could fall through to the default video caption prompt and reserve allowance. This behavior has a regression test.

Validation: ten Telegram tests passed, covering isolated user choices, duplicate webhook delivery, selection without debit, invalid/removed tracks, disabled music and unsupported attachments; five existing catalog tests passed in the earlier combined run (fourteen before adding the attachment regression). Convex typecheck passed. These exercise Convex test state; scheduled replies are not delivered to real Telegram Web and licensed music delivery is unverified. Actual bot commands, speech/music listening and cloud rendering remain acceptance gates. The owner still needs to provide export-licensed tracks; popular Instagram music is not bundled.

## Telegram delivery latency instrumentation, local implementation, 2026-09-08

The durable outbox now records each attempt's start and persists `telegramDeliveredAt` only after the Telegram Bot API returns success. Fenced completion/recovery emits structured events for `telegram_api_delivery` (attempt time, including failure), `telegram_after_render` (render completion to API acceptance) and `telegram_total` (job creation to API acceptance, including queue and retries). Logs contain job ID, attempt, timing and outcome, without prompts, account IDs, chat IDs, signed URLs or secrets.

The existing latency summarizer accepts these events together with worker events. Export both Convex and worker logs to obtain all stages; worker `post_completion_hook` remains unrelated to actual Telegram delivery. These metrics measure API acceptance, not receipt on a user's device, playback or viewing. Actual Telegram Web observations are still required for end-to-end acceptance.

Validation: eleven Telegram tests and three latency-report tests passed; Convex typecheck passed. A deterministic clock test covers a failed attempt, delayed retry, stale acknowledgement and final accepted timestamp; total latency includes the delay and failed attempt. No actual provider latency has been measured by this pass.

## Payment reconciliation, local implementation, 2026-09-08

Purchase history now offers "Check payment status" for unconfirmed orders. An authenticated, owner-scoped action reads the saved checkout session from Dodo, fetches its canonical payment, and applies the existing strict order/product/amount/business/environment validation and atomic fulfillment. This can recover a missed successful webhook without creating a new checkout or trusting redirect parameters. Paid orders return without another provider request; refresh attempts are limited to one per order per minute. API lookup failures or mismatched data cannot grant credits.

Ambiguous creation without a saved session remains held for operator review. The UI supplies the order reference rather than encouraging a new payment attempt. This does not yet implement provider-side discovery of lost session IDs, scheduled reconciliation, refunds/disputes or expired checkout replacement. Checkout remains disabled until those billing gates and real Dodo sandbox acceptance are completed.

Provider contract verified against [Dodo Get Checkout Session](https://docs.dodopayments.com/api-reference/checkout-sessions/get-checkouts). All provider responses in the tests were mocked; no live or sandbox payment was made.

Validation: 21 payment tests and 15 UI tests passed, including missed-webhook recovery, duplicate protection, foreign-account rejection, invalid amounts, cooldown, ambiguous-session holding and checking from purchase history without starting checkout. Convex typecheck and frontend build passed; the existing bundle-size warning remains.

## Abandoned upload session expiry, local implementation, 2026-09-08

A fifteen-minute internal cron marks pending upload sessions older than one hour as expired, processing at most one hundred rows per invocation through a status/time index. Repeated runs advance through the backlog. Ready uploads, their storage objects and queued/running edit sources are untouched. Finishing an expired session is rejected.

This expires session metadata only. It does not reclaim unknown blobs from interrupted native storage uploads; there is currently no trustworthy mapping for those objects. Hard transport limits and attributable orphan cleanup remain open upload-protocol work. No production cleanup ran.

Validation: all six upload tests and Convex typecheck passed after correcting the new query's generic index typing. The expiry test processes 105 old sessions in batches of 100 and five, preserves a fresh pending session and a ready source referenced by a queued edit, and rejects finalization of an expired session. No real uploaded user files were deleted.

## Studio failure-state review, local implementation, 2026-09-08

Job/history reads now normalize URL IDs and return unavailable for malformed IDs or IDs from another table while retaining authentication and ownership checks. History reads no longer require an already-provisioned user row just to display an unavailable link. Studio distinguishes sign-in connection failure, missing video and cancelled generation instead of showing indefinite loading. Its dashboard navigation remains available for recovery.

Validation: 32 history/UI/job tests, Convex typecheck and frontend build passed. Tests include invalid/empty/wrong-table IDs, unauthenticated reads, authentication query gating and explicit missing/cancelled messages. The existing bundle-size warning remains. Real staging browser failure-state acceptance is still pending.

## Explicit source-audio replacement, local implementation, 2026-09-08

Studio soundtrack controls now offer an explicit, unchecked-by-default "Remove all original audio, including speech" choice. The warning states that original speech, music and effects are removed only from the new version; existing version history preserves the source. Speech ducking is disabled in the control while replacement is selected. The saved music snapshot passes the choice through both normal and AI-scene workers to FFmpeg. Default mixing behavior is unchanged.

Replacement produces the selected looped/faded soundtrack while preserving video duration. This is full source-audio removal, not stem separation: retaining speech while removing baked-in music still requires a separate source-separation feature. Telegram defaults to mixing; its command workflow does not yet expose replacement. Licensed tracks and actual creator-footage listening remain acceptance requirements.

Validation: 35 music/UI/Telegram tests and four backend music/integration tests passed. Real decoded audio checks verify suppression of source speech energy, consistent music through the source's speech interval, and retained output duration. The measurement accounts for finite bandpass leakage by comparing silent/speech intervals and the original mix. Backend/frontend builds and Convex typecheck passed; existing frontend bundle-size warning remains.

## Approved soundtrack preview, local implementation, 2026-09-08

The soundtrack picker now loads an audio preview on demand without reserving a generation. The authenticated Convex action accepts only a catalog track ID, resolves its private key server-side and calls a secret-protected music-signing route. That route only permits constrained `music/<name>.mp3|wav|m4a` keys, uses the existing fifteen-minute GCS read signing and never accepts video keys or traversal. The player explains that it plays the original track; mix level and speech ducking are applied only on render. Expired/unavailable audio offers a fresh preview request.

Validation: 26 music/UI tests, the real HTTP dispatcher test, both builds and Convex typecheck passed. Tests cover unauthenticated/unknown track rejection, no generation reservation, allowed key signing, forbidden key/traversal rejection and preview media-error recovery. Provider signing and DOM playback are mocked in application tests; actual GCS playback, expired-link refresh and licensed music listening remain staging acceptance gates. Existing frontend bundle-size warning remains.

## Worker error-handling review, local implementation, 2026-09-08

Provider error text is replaced with generic user-facing failure messages in the managed worker and durable queue. Found and removed a direct logger call in the post-completion delivery catch: if both delivery and that logger threw, a completed output could produce an uncertain worker failure. Delivery failure is already captured by exception-isolated stage telemetry; it cannot now change the accepted completion outcome through that logger path.

Validation: eleven worker tests and three telemetry tests passed, plus backend build and diff checks. The new test combines a provider failure with a logger that throws, and verifies completed outcome, one completion, no refund/failure call and cleanup.

GCP access rechecked with read-only `gcloud projects describe previous-unrelated-project --format='value(projectId)' --quiet`; it failed token refresh and requested `gcloud auth login`. No deployment/provisioning occurred. The connection tasks and real multi-user acceptance gates remain open.

## Refund credit lifecycle, local implementation, 2026-09-08

Signed `refund.succeeded` handling now fetches the canonical refund and payment, validates the saved order/business/environment/session/cart/currency/amount, and reconciles the payment's full list of successful refunds. A refund ledger deduplicates references transactionally and rejects reference conflicts, invalid amounts and totals exceeding the captured payment. Partial refunds remove a cumulative proportional share of pack credits, rounded up to whole credits; full refunds remove the entire pack. The denominator includes captured tax, matching the amount actually paid. This proposed entitlement policy and customer refund terms require review before checkout enablement.

A refund arriving before the payment event settles the captured purchase net of all successful refunds visible in the canonical snapshot. Subsequent payment/failure events cannot restore removed credits or downgrade the recorded refunded state. Successful payment events and unconfirmed-order refreshes also reconcile refunds present in the canonical payment. Missing-session and incomplete/null-amount refund data fail closed for reconciliation.

If refunded credits have already been used, the internal balance can become negative so future purchases and restored failed-job reservations offset the adjustment. Public available credits are clamped to zero and the adjustment is separately displayed on dashboard and pricing before purchase. Free lifetime allowance is unaffected. Purchase history displays partial/full refund status, refunded amount and removed credits. Existing videos are preserved; no refund is initiated by this code.

Remaining billing gates: dispute lifecycle, scheduled reconciliation (including already-paid orders whose refund event was missed), real refund sandbox testing, expired/ambiguous checkout recovery and refund-policy review. Checkout remains disabled. This is not live financial acceptance.

API references: [Dodo refund details](https://docs.dodopayments.com/api-reference/refunds/get-refunds-1), [payment details and refund list](https://docs.dodopayments.com/api-reference/payments/get-payments-1), [webhook event types](https://docs.dodopayments.com/developer-resources/webhooks/intents/webhook-events-guide).

Validation: 34 payment/webhook tests and 21 UI tests passed; Convex typecheck, frontend build and diff checks passed. Coverage includes real signature verification with mocked canonical lookups, concurrent duplicate refunds, partial-to-full aggregation, refund-before-payment, spent-credit adjustment, invalid amount/currency/business/payment/status rejection, and refund explanations before buying another pack. Existing frontend bundle-size warning remains. No real refund or charge occurred.

## Rechecking settled payments, local implementation, 2026-09-08

Removed the paid-order short circuit from owner-triggered payment refresh. Paid and refunded purchase-history rows can now be checked through the provider, with the existing one-minute cooldown. This recovers a missed refund webhook on an already-paid order. Checks retain the saved payment binding and reject a changed or missing payment ID. The returned status is re-read from the durable order after reconciliation so a stale provider snapshot cannot make the UI claim payment confirmation after a recorded refund.

Scheduled reconciliation remains pending; this pass adds user-triggered recovery for settled orders. No provider charge, refund or real sandbox action occurred.

Validation: 52 payment/UI tests passed, plus Convex typecheck, frontend build and diff checks. New tests verify recovery of a missed refund on a paid order and preservation of refunded status under a stale provider response. Existing bundle-size warning remains.

## Scheduled payment reconciliation, local implementation, 2026-09-08

New orders become due for a provider check after five minutes. A one-minute internal cron selects at most 25 due orders through an environment/time index and schedules fenced reconciliation attempts. Test and live data are isolated by configured environment. Checks reuse the strict captured-payment/refund reconciliation; successful settled orders are checked daily, unresolved/provider-failed checks after fifteen minutes, and missing-session reviews daily. A ten-minute scheduling lease allows stopped actions to be retried. Duplicate/stale attempt completion cannot overwrite a newer check. A recent manual check delays scheduled work to respect the per-order cooldown.

Provider failures persist generic `reconcileError` values; missing sessions remain explicitly marked for review and never trigger another checkout. `reconciledAt` is recorded only on success. New fields do not grant credits; existing atomic payment/refund validation owns all balance changes.

### Enablement and migration

Leave `DODO_RECONCILIATION_ENABLED` unset until the target staging Dodo configuration and sandbox flows are validated. `DODO_ENVIRONMENT`, `DODO_API_KEY` and `DODO_BUSINESS_ID` must match that deployment. Existing orders lack a next-check timestamp: the internal `payments:enrollExistingOrders` migration accepts an explicit test/live environment and enrolls at most 100 rows per call; repeat until zero in the intended deployment. No migration or live reconciliation has run during local validation. Validate provider API quotas, catch-up time, missing-session operational review and error alert routing before production enablement. Dispute lifecycle and real Dodo sandbox acceptance remain pending.

Validation: 36 payment tests passed, including scheduled settlement without browser identity, duplicate execution, environment/batch isolation, stale completion, provider failure, missing-session review and repeat-safe existing-order enrollment. Five webhook tests passed in the preceding combined run. Convex typecheck passed. Provider calls are mocked and scheduled actions are exercised directly in test state; real scheduler/provider acceptance remains open.

## Full regression and owner handoff, 2026-09-08

The first combined local test/build run exposed a stale soundtrack component mock (missing the new preview action) and multiple timeouts under concurrent FFmpeg/build load. Fixed the mock and updated the default selection expectation; added UI assertions for opt-in source-audio removal, the speech warning/ducking state, preview failure/retry and expired URL recovery without changing the edit selection. Browser audio playback itself still requires real acceptance.

The four timed-out backend test files passed all 26 tests when limited to two workers. Backend Vitest now uses at most two file workers, keeping real FFmpeg regression work bounded without increasing timeouts or changing product concurrency. The explicit queue/load tests still exercise their own concurrent jobs.

Final fresh results:

- Root: **124 tests passed across 16 files** (3.89 seconds).
- Backend: **152 tests passed across 28 files** (60.75 seconds), including real local media processing.
- Frontend build, backend build and Convex typecheck passed.
- Terraform format check and validation passed; nothing applied.
- Lint exited successfully with five existing warnings; Vite retains the 883 KB bundle warning.
- No cloud deployment, real Telegram Web run, Dodo sandbox checkout or live provider generation was performed.

The short [owner connections checklist](OWNER-CONNECTIONS.md) pairs each required connection with its acceptance test. The current top-level matrix was refreshed to distinguish implemented refund/reconciliation/music features from remaining disputes, editing gaps and external acceptance. The full product goal remains incomplete.

## Fractional editing cuts, local implementation, 2026-09-08

Studio trim controls now accept up to three decimal places and retain that precision in free preview and submitted instructions. The router distinguishes colon timecodes with fractional seconds from the legacy dot-only MM.SS format; decimal seconds no longer become additional colon components. Existing whole-second and legacy dot-style requests continue to work.

The UI explains that exported boundaries follow source frames. This is finer time selection, not a claim of a frame-addressable timeline or exact browser preview stopping. Those editing controls remain pending.

Validation: six Studio control tests and 42 backend routing/edit-plan/timeline/media tests passed. A real 30-fps source was cut using the actual Studio instruction format from 0.125 to 1.375 seconds; output duration was within one source frame of 1.25 seconds, retained audio/video and passed full decode. Fractional boundary-word caption mapping also passed. Both builds and diff checks passed; the existing bundle warning remains. No cloud/provider acceptance occurred.

## Managed clipping range consistency, 2026-09-08

Follow-through review found that the managed worker still used a separate legacy timestamp regex. A fractional range could therefore trigger automatic moment selection even though the router understood the requested cut. The router and worker now share `timestampRange`; whole-second, fractional, hour-based and legacy dot-style explicit ranges bypass automatic selection and reach the handler unchanged.

Validation: 28 router, managed-pipeline and worker tests passed; backend build and diff checks passed. Pipeline tests assert that the moment provider is not called and no automatic edit plan is attached for each supported explicit timecode format. Real YouTube downloading and cloud rendering remain acceptance gates.

## Telegram source-audio choice, 2026-09-08

Telegram now accepts `/music TRACK_ID LEVEL_PERCENT mix` or `/music TRACK_ID LEVEL_PERCENT replace`. Omitting the mode defaults to mixing, including when changing a previously replacing selection. Mix retains original audio with speech ducking; replace disables ducking and removes all original audio, including speech and effects. Library and selection replies explain the difference before a render is requested. `/music off` removes the selection.

The choice is stored per Telegram link and snapshotted into the normal approved-track job payload. Selection uses no allowance; changing settings cannot mutate queued jobs. Invalid modes leave the prior setting intact and do not render. This reuses the existing real-FFmpeg-tested source-audio replacement path.

Validation: 18 Telegram/music tests passed and Convex typecheck passed. Tests verify the scheduled warning text, zero selection debit, invalid-mode preservation, per-render snapshots and return to default mixing. Real Telegram delivery/playback and licensed-track listening remain unverified. Telegram music preview and AI-scene selection remain pending.

## Telegram full-queue recovery, 2026-09-08

A full global queue now produces a clear Telegram reply with no allowance used, instead of failing the webhook and leaving Telegram to retry admission silently. Only the known pre-debit QUEUE_FULL error is handled; unexpected database/scheduler failures still roll back the complete mutation. A rejected update is acknowledged and deduplicated, so a later transport replay cannot create an unexpected video when a slot opens. The reply asks the user to resend when capacity is available.

Validation: 25 Telegram/queue tests passed and Convex typecheck passed. The regression fills 1,000 slots, verifies zero user debit/job creation and the scheduled reply, frees one slot, checks that replay remains inert, and verifies a fresh request creates exactly one job/reservation. Actual Telegram delivery of the message remains unverified; ordinary bot-message retry handling is still an operations gap.

## Durable Telegram text replies, 2026-09-08

Webhook reply creation now commits a `telegramMessages` row together with update deduplication and job admission. Actions claim a 60-second sending lease; a minute cron recovers up to 50 due pending and 50 interrupted sending replies. Attempts are fenced, capped at three, and expire after ten minutes so stale acknowledgements are not sent indefinitely. Replies never modify video jobs or allowance.

The sender checks both HTTP and Telegram JSON success, respects `retry_after`, and treats recipient rejection as terminal. Failed responses save generic operational errors without token-bearing URLs or provider payloads. Successful delivery records API acceptance time and provider message ID when supplied. Reply bodies are removed on success or terminal failure; metadata retention/alert routing still needs an operations policy. Existing scheduled legacy sendMessage calls remain compatible, but new webhook replies use the durable path.

Validation: **132 tests across 17 root files passed**, with Convex typecheck and diff checks passing. New tests cover API failure despite HTTP 200, rate-limit delay, success replay protection, interrupted-send recovery, stale completion, transport failure exhaustion, expiry, blocked recipients, and no duplicate outbox row under webhook replay. Provider responses are mocked; no real Telegram message was sent.

Ambiguous network success can still produce duplicate text messages after a retry, and replies can arrive out of order; the protocol has no exactly-once message-send key here. These cannot trigger duplicate rendering or billing. Real multi-user Telegram acceptance, provider pacing and operational alert routing remain pending. API behavior reference: [Telegram request results](https://core.telegram.org/bots/api#making-requests) and [retry parameters](https://core.telegram.org/bots/api#responseparameters).

## Checkout return identity protection, 2026-09-08

Pricing no longer clears every saved attempt merely because a URL contains `order`. The owner-scoped order query includes its request ID; only a matching attempt for the same pack is cleared after a server-recorded terminal state. Unverified, loading, pending and unrelated/newer attempts retain their retry identity. This prevents revisiting an old or arbitrary return URL from silently abandoning an in-flight checkout.

Expired-local-attempt and already-paid errors now explain the recovery path instead of a generic retry. Automatic expired-session replacement remains pending: the local 23-hour reopening guard is not proof that an earlier payment cannot settle. The documented [Dodo session response](https://docs.dodopayments.com/api-reference/checkout-sessions/get-checkouts) exposes session/payment state but no explicit expiry confirmation. Provider-supported recovery and sandbox acceptance are still required before enabling checkout.

Validation: 61 payment/UI tests passed, plus frontend build, Convex typecheck and diff checks. New UI tests cover loading/unavailable/pending returns, matching terminal cleanup, unrelated pack preservation and a newer same-pack attempt. Existing bundle warning remains; no real checkout or charge occurred.

## Route loading and browser verification, 2026-09-08

Landing, Pricing, Dashboard and Studio now use separate lazy-loaded route modules. Shared authentication/backend providers remain mounted. A loading state and recoverable error boundary cover route download failures; unknown URLs show a dashboard return link. Analytics initializes from its own asynchronous chunk and cannot block application startup if its import fails.

Build evidence: the main JS chunk decreased from 883.85 KB (270.83 KB gzip) to 401.78 KB (121.09 KB gzip). Marketing, route and analytics chunks are separate; the total bytes across all chunks have not disappeared. This is bundle splitting, not a measured network or interaction-latency improvement. No chunk exceeds the default 500 KB warning threshold in this build.

Validation: 27 relevant UI/error-boundary tests passed and production build passed. Actual local in-app browser at http://127.0.0.1:4319 verified Pricing with all three correct packs, navigation to the signed-out Dashboard gate, landing-page navigation and the missing-page recovery route. No authenticated generation, cloud browser or provider action occurred. Existing local preview server uses port 4319; an unrelated/earlier listener already occupied 4173.

The landing review exposed unsupported product claims (Discord/WhatsApp availability, lossless size-target compression, voice isolation and broad instant transcoding) plus placeholder footer destinations. Correct these against actual product capabilities before the investor walkthrough; neither these claims nor real performance are accepted yet.

## Landing honesty and working example navigation, 2026-09-08

Landing copy now describes the implemented web/Telegram path, MP4 delivery, versions, canvas choices, precise timing and soundtrack mixing. Removed unverified claims of available Discord/WhatsApp clients, lossless size-target compression, instant arbitrary transcoding and speech isolation. Animated examples are explicitly identified as examples; fake output/download controls now lead to the actual creation route. Footer links point to existing Pricing, Dashboard and How it works destinations; unsupported company incorporation text and placeholder social/docs/privacy destinations were removed.

This does not complete or remove the broader product work. Legacy advertised GIF/sticker/audio-only outputs, size-target compression and audio-isolation workflows still need implementation/acceptance through the managed platform before they can be offered there. Privacy and terms pages, data-retention choices and owner/entity/contact details remain launch requirements. CLI media operations alone do not establish managed-platform delivery support.

Validation: production build and the example-flow interaction test passed. The test verifies the no-render/no-charge explanation and actual /create link, with no fake download button. Actual local browser at port4319 verified revised copy, the interactive trim example and its creation link. A rebuild replaced an old tab's unrequested route chunk, causing the expected error boundary; clicking Reload restored the signed-out Dashboard. This also supplies a real local stale-bundle recovery check. No authenticated cloud/Telegram/provider acceptance occurred. Verification tabs were closed; the local preview server remains available.

## Studio late-response navigation race, 2026-09-08

Studio edit submissions now capture the current view generation. Route changes/unmount invalidate it; a late result or error from a previous view cannot navigate back, append messages to another video, or clear a newer submission's busy state. The server job continues normally and remains discoverable through history. Existing per-version trim reset was verified in code.

Validation: 26 UI tests and frontend build passed. The navigation regression was also run with response guards temporarily removed: it failed as expected, then passed after restoration. The test submits an edit, navigates to Dashboard while it is pending, resolves the request, and confirms Dashboard remains visible with only one submission. This is local component evidence, not live provider acceptance.

## Strict production script generation, 2026-09-08

Configuration review found a gap in strict rendering: footage and voice failures were rejected, but content generation could still replace failed model output with generic template scripts. Managed generation now passes strict/cancellation options into both angle and narration generation. Missing API key or explicit model name, failed provider calls, malformed angle fields and invalid narration bounds fail before voice/render work. A lost worker lease aborts an in-flight model request. Offline CLI/tests retain explicit template behavior; no model name is guessed for a configured account.

Narration validation checks shape and reasonable size, not factual correctness or creative quality. Those still require actual output review. The provider configuration examples and setup documentation now state the model/key requirement; an unused API key example was removed because this runtime then used one key for the model and speech path. Gemini on Vertex AI later replaced that path, configured by `GEMINI_PROJECT` and `GEMINI_MODEL` with no API key.

Validation: **170 backend tests across 30 files passed** in 32.40 seconds, including real local media and offline full generation/editing. Twelve new content tests cover configuration, provider errors, malformed output, valid text preservation and lease cancellation. Narration wiring tests verify strict options reach the content module. Backend build and diff checks passed. Paid provider calls are mocked; no production generation, deployment or cloud acceptance was performed.

## Transcription cancellation and timing validation, 2026-09-08

The worker signal now reaches narration and source-video transcription, file reads and the provider request. A pre-aborted operation never reads/uploads a source; an in-flight upload aborts on lease loss. Provider rejection messages retain the HTTP status without copying raw response text into job errors.

Transcription parsing rejects empty/non-text words, missing/nonfinite/negative/reversed timings, out-of-order starts and excessive entry counts. This prevents malformed nonempty arrays from passing the production speech check and yielding blank or misaligned captions. Valid word and segment responses remain supported; real speech-recognition accuracy still needs provider/footage acceptance.

Validation: 30 transcription, narration-wiring, worker and caption-timeline tests passed; backend build and diff checks passed. Transport-cancellation tests use mocked uploads, not a real Whisper request. Previous full backend regression passed 170 tests before this pass; it is not a fresh full-suite claim for these changes.

## Production container architecture and fresh regression, 2026-09-08

Built both native `linux/arm64` and deployment-target `linux/amd64` images locally. The initial amd64 build failed on an npm ECONNRESET; a retry completed successfully. The amd64 image ID is `sha256:88fb4d2c7bb814a1fc776af06c9fdf40391efb5a4d3e068fdb5e76e8e53ab2b9`.

Strengthened `scripts/container-smoke.sh` to validate the captioned output through the actual delivery normalizer/full decoder and exercise the packaged HTTP dispatcher. Both architectures passed with networking disabled: synthetic source → square 1080×1080 H264/AAC video → strict caption processing → complete decode, plus HTTP health and unauthorized-dispatch rejection. The new check initially passed the operation result object instead of its output path; correcting the harness produced passing runs. This is real local media processing, not a real source/provider/cloud/Telegram test.

Fresh complete regressions: **140 web/Convex tests across 19 files passed**, **179 backend tests across 30 files passed**, Convex typecheck passed, and diff whitespace checks passed. Backend runtime dependency audit currently reports two moderate findings (gaxios/uuid); dependency remediation and broader dependency review remain pending. The build's full dependency audit also includes development-tool findings and must not be represented as clean.

GCP authentication was rechecked and still requires `gcloud auth login`. No resources were provisioned and no deployment was performed. Connection tasks remain in [OWNER-CONNECTIONS.md](OWNER-CONNECTIONS.md). Ten-user cloud concurrency, real Telegram Web multiuser delivery, paid-provider quality and Dodo sandbox acceptance are still required.

## Dependency remediation, 2026-09-08

Updated backend Vitest to 5 with its compatible Vite 8 peer, adjusted worker configuration, and documented the Node version requirement. Google Storage still inherits gaxios 6; a scoped UUID 11.1.1 override addresses its advisory while retaining the CommonJS v4 API used for multipart boundaries. A new test resolves that dependency through Storage and sends a real multipart HTTP request to a local server, checking metadata, media bytes and boundary integrity. Its initial fixture used the wrong multipart field names and timed out; the corrected fixture passes. This is SDK HTTP compatibility evidence, not authenticated GCS acceptance.

Applied compatible frontend/transitive updates including React Router 7.18.3, DOMPurify, PostCSS, fflate, nanoid and Browserslist. Both backend and root npm dependency audits now report **zero findings**. This supersedes the preceding npm audit counts; it is not a complete application, container OS or supply-chain security assessment.

Fresh validation after updates: **180 backend tests across 31 files**, **140 web/Convex tests across 19 files**, backend/frontend builds and Convex typecheck passed. Lint exits successfully with **seven warnings**, and diff whitespace checks pass. Rebuilt the `linux/amd64` production image (`sha256:1a8cb2268e9864c5e12c12306bcc8612a85988c1814d64d95dbecb062297af72`) and passed the network-isolated real video/caption/decode and packaged dispatcher checks. No deployment or paid provider call occurred. Native arm64 smoke evidence above predates these dependency updates.

## Caption selection before rendering, 2026-09-08

Web stock generation, YouTube clipping and owned-upload edits now offer automatic captions, clean static text, uppercase bold pop, short-phrase pop-in, or no added captions. The choice is validated, persisted with the job and passed through the worker. Explicit settings override prompt styling while preserving other edits; disabling captions skips generation's transcription call without dropping narration. AI scenes hide and reject these settings until that renderer supports them.

This does not restyle text already burned into source footage. The selector explains that source text remains; completed-version restyling still needs clean artifacts and transcript persistence. Detailed positioning/color/typeface controls, Telegram selection parity and actual creator-footage QA remain pending. See [caption design](../superpowers/specs/2026-09-08-caption-controls.md).

Validation: **143 root tests** and **187 backend tests** passed, including selection UI, invalid-value rejection before debit, replay-safe job persistence/claim, operation ordering, uppercase generation cues and transcription avoidance. The upload propagation assertion and worker forwarding assertion also passed. Frontend/backend builds, Convex typecheck and diff checks passed. Initial UI validation caught use of mode before initialization; corrected before passing runs. Updated amd64 container built and rendered/fully decoded all three caption styles with networking disabled, plus dispatcher health/authentication checks. No real speech/provider/cloud or Telegram acceptance occurred.

## Telegram caption preferences, 2026-09-08

Linked Telegram accounts can use `/captions` to inspect their preference and `/captions auto|clean|bold|pop|none` to set it. Selection is free, works after allowance exhaustion, and affects future submissions only. Jobs snapshot the setting; changing it cannot mutate queued renders. Unknown choices and extra arguments leave preferences unchanged. Help and web connection guidance expose the command and explain that existing source text remains.

Local validation passed 43 Telegram/UI tests, then the expanded Telegram suite passed after adding confirmed-YouTube and uploaded-video propagation coverage. Tests exercise duplicate updates, settings without debit, queued-job immutability, reset to automatic and isolation between two linked identities. Frontend build, Convex typecheck and diff checks passed. This is simulated ingress/state evidence, not real Telegram Web delivery or observed multiuser acceptance. Caption preview/restyling, AI scene selection and version editing parity remain incomplete.

## Telegram replies create edit versions, 2026-09-08

The video-delivery outbox now records a returned message ID when it matches the intended chat and current attempt. Replying to that video with trim, speed or framing instructions resolves an owned, completed source and creates a normal managed edit with parent/root ancestry. The source aspect is retained unless explicitly changed; duplicate updates charge once. Unknown, foreign or unsupported reply targets do not enqueue or debit. Rights-confirmation replies still work.

Reply edits preserve existing caption pixels and audio; the account's caption/music defaults are not reapplied. Burned-caption restyling requests explain the clean-source requirement. Normal free-tier branding remains after reframing: an attempted watermark-skipping shortcut was removed because cropping can erase the previous mark. Older deliveries without a recorded ID and ambiguous lost-response copies use dashboard recovery. See [reply-edit design](../superpowers/specs/2026-09-08-telegram-reply-edits.md).

Fresh full regression: **151 root tests and 188 backend tests passed**, followed by the 21-test Telegram suite after clarifying settings/queue copy. Backend build, Convex typecheck and whitespace checks passed. Receipt tests use a mocked Telegram API, while ownership, replay, ancestry, debit and recovery tests use simulated Convex ingress. This does not prove real Telegram Web delivery, cloud rendering or latency. Preview, AI selection, clean-source restyling and live multiuser acceptance remain pending.

## Verified dispute observations and review guard, 2026-09-08

Signed Dodo dispute events now fetch canonical dispute/payment records and validate the saved order binding before storing a minimal observation. Payment/refund reconciliation also records embedded disputes. Observations deduplicate and reject older local lookup-start timestamps; this does not establish provider update ordering. Owner purchase history shows the review flag and order reference.

Disputed purchases cannot receive an initial credit grant, including the refund-before-capture path. Existing balances are unchanged by dispute observations, and resolution events do not automatically restore credits. Complete hold/deduction/restoration and refund-overlap accounting remain unimplemented; checkout stays disabled. No monetary amount is inferred from the provider's dispute amount string. Amount units and policy are listed for owner/sandbox confirmation. See [dispute review design](../superpowers/specs/2026-09-08-dispute-review.md) for the exact boundary and authoritative provider sources.

Validation: **75 targeted payment, signed-webhook and UI tests passed**, plus frontend build, Convex typecheck and diff checks. Coverage includes all seven dispute event names, canonical lookup over webhook metadata, lookup failures/mismatched IDs, stale observations, no automatic balance changes, initial-fulfillment/refund bypass guards and owner-only review display. Provider responses are mocked; no real dispute, checkout, deduction or deployment occurred.

## Opt-in Veo infrastructure, 2026-09-08

Terraform now accepts an optional explicit Veo model/region, enables Vertex AI and grants the worker the documented Vertex AI User role in the deployment project. It derives the worker's provider environment from this input and rejects duplicate/alternate VEO settings. Default plans contain no Veo role, API resource or environment settings. Existing private storage and ADC are reused. The role is broader than a Veo-only permission; live least-privilege refinement remains possible after actual permission acceptance.

Eight mocked Terraform plan tests pass, covering default-off behavior, opt-in API/IAM/environment wiring, invalid model rejection and configuration collisions. No GCP resources or paid renders were created. This completes configuration code, not live IAM/model availability, quota, cost or video-quality acceptance. The independent Convex capability remains disabled until staging acceptance; see the infrastructure README for drain/change safeguards.

## Caption archive storage foundation, 2026-09-08

Supported new managed renders now produce a private caption-free video and bounded timing JSON alongside the normal output. Executor hooks retain the pre-caption source before cleanup; reproducible subsequent effects are applied to the archive. Worker uploads both artifacts before finalizing, and Convex checks their exact job/lease paths as a pair. Existing-export edits and provider-selected post-caption overlays do not advertise a clean archive; embedded source text remains. See [archive design](../superpowers/specs/2026-09-08-caption-archives.md).

The restyling request API, archive reader, worker render branch and Studio controls remain unimplemented. These artifacts add storage and render cost; cloud latency/retention acceptance remains required. This is caption-layer retention, not a fully reversible project.

Validation: full runs passed **159 root tests and 189 backend tests**; the subsequent two-test archive suite passed with the new reproducibility guard. Convex typecheck and backend/container builds pass. Tests reject incomplete/foreign archive keys and stale completions, exercise real media/timing retention, and check cancellation. Linux container smoke verifies that archives survive executor cleanup, captioned/clean decoded frame hashes differ, and output fully decodes. The initial speed-duration assertion exposed existing two-frame CFR boundary variation; the test now states that tolerance while checking exact timing metadata. No actual GCS upload, provider render or cloud acceptance occurred.

## Caption restyling, local implementation, 2026-09-08

Studio now creates a new caption-only version from an owned archived clean video and saved cues. Choices are clean, bold uppercase, short-phrase pop-in and removal. Repeated restyling preserves ancestry and soundtrack attribution. Requests use normal queue limits, idempotence and allowance charging; foreign or malformed archive pairs fail before charging. Legacy exports without an archive show an unavailable explanation.

The worker validates bounded metadata and paired private paths, avoids model/transcription calls, keeps the clean base for future restyles and applies normal branding. Source-embedded text cannot be removed. Existing music and branding can already be baked into the retained base. Arbitrary caption wording/position/font editing, Telegram caption-restyling parity and a fully reversible project remain pending.

Fresh isolated verification: root **162/162 tests**, backend **191/191 tests**, Convex typecheck and lint (seven warnings, zero errors). An earlier concurrent build/root/backend run timed out in two UI tests and one media integration test; unchanged suites passed after running separately. Do not use these loaded-machine suite durations as product latency measurements. Real cloud/GCS/Telegram acceptance is still pending.

Production AMD64 Linux image build and network-disabled container smoke passed: actual clean/bold/pop-in renders, caption removal matching the clean frame, decoded audio unchanged across restyling, full H.264/AAC delivery decode, dispatcher health and unauthorized-request rejection. Frontend production build passed. These use synthetic media; creator-footage quality, cloud storage and real user acceptance are separate gates. Logs: `/tmp/takeone-restyle-linux-smoke.log`, `/tmp/takeone-restyle-root-isolated.log`, `/tmp/takeone-restyle-backend-isolated.log`.

## Telegram caption restyling, 2026-09-08

Delivered-video replies now accept `captions clean|bold|pop|none`, reuse Studio's archive-pair validation and managed render branch, preserve source ancestry/audio/music attribution, and deliver the new version through the existing outbox. `/captions` remains a free future-render preference. Standalone instructions, mixed edits, missing/mismatched/foreign layers, exhausted allowance and full personal queues do not spend a generation. Duplicate update IDs enqueue only once. Dashboard connection guidance and bot help explain the distinction.

Verification: **169/169 root tests**, Convex typecheck and production frontend build passed. Added tests exercise each style, replay, ownership, malformed archives, unchanged defaults, credit rejection and queue limits. Worker/media code is unchanged from the preceding Linux render verification; this pass does not establish real Telegram transport or cloud latency. Connected Telegram test identities remain required for that acceptance.

## Verified checkout expiry/retry, 2026-09-08

Owner refresh and scheduled reconciliation now mark a known session expired only after matching its ID, observing explicit null payment ID/status and a provider creation time older than 24 hours plus five minutes. Mutation guards preserve paid orders, dispute review and newer observations. Pricing explains the expiry and retires only the matching cached attempt; a new checkout needs another user click. Missing session/ambiguous create remains review-only; no automatic second POST. Late canonical captures still go through idempotent fulfillment.

Evidence: **176/176 root tests**, Convex typecheck and production frontend build passed. Tests cover provider empty fields, malformed/recent timestamps, binding, stale observation, paid-state preservation and explicit retry identity. Real Dodo sandbox expiry/retry remains pending. Nonterminal provider-action states and ambiguous creation/operator recovery remain separate implementation work.

Provider contract: [checkout guide](https://docs.dodopayments.com/developer-resources/checkout-session), [session detail](https://docs.dodopayments.com/api-reference/checkout-sessions/get-checkouts), reviewed 2026-09-08. The five-minute margin is a local policy; an expired URL by itself is never treated as payment proof.

## Nonterminal payment states, 2026-09-08

Canonical reconciliation now records the provider's customer-action, merchant-action, payment-method, confirmation, capture and partial-capture states. History, checkout return and refresh messages distinguish these from successful credit purchases. No partial/authorized payment grants credits or retires the current attempt. Equal-time failed/cancelled observations resist nonterminal regression; reconciliation uses lookup-start time so slow older requests cannot overwrite newer observations. Full success still requires the existing strict capture checks and idempotent ledger.

Verification: **89 payment/UI tests passed**, Convex typecheck and frontend build passed. A deterministic slow-response test inserts a newer failure while an older provider lookup is in flight, then confirms that the failure survives. Every new provider state is tested for zero credit grants and transition to exactly one grant on later success. Webhook regression was also rerun. Real merchant sandbox transitions, a direct resume-checkout control, ambiguous-create/operator recovery and full dispute credit accounting remain pending.

## Continue checkout, 2026-09-08

Purchase history now offers a server-derived Continue checkout affordance for eligible known recent sessions. The owner action shares the refresh throttle, validates canonical session age and explicit payment fields, reconciles any payment, and rechecks durable owner/session/status before returning the saved environment-specific Dodo HTTPS URL. It sends no create request, changes no request ID and opens no expired/disputed/captured/merchant-review checkout. Custom merchant checkout domains are not enabled by this implementation. Known sessions older than 23 hours use status/expiry recovery; ambiguous creation still needs operator recovery.

Verification: payment/UI/webhook suites passed (104 tests), followed by the expanded payment suite including both empty-session and customer-approval resume. Convex typecheck and frontend production build passed. Tests reject foreign, captured, disputed, old, malformed and wrong-host sessions; a captured response is fulfilled normally and cannot resume. Real hosted sandbox resume remains pending owner connections.

## Paid checkout recovery after lost creation response, 2026-09-08

Signed webhook processing now repairs a missing session binding from a canonical fully captured payment only when the saved order has a request ID and unresolved creation claim. Exact order/product/quantity/USD amount/tax/business/environment checks apply before mutation, and environment/session or payment reuse conflicts are rejected. Recovery stores its payment reference and timestamp, grants nothing itself, and then uses the existing fulfillment/refund/dispute flow. Duplicate notifications preserve the original audit and grant at most once. A delayed original response can attach the same session URL; conflicting sessions fail.

Verification: **205/205 root tests**, Convex typecheck and production frontend build passed. Tests include real webhook signatures with mocked canonical lookup, duplicate recovered success, invalid creation/amount/business/status/binding, and refund/dispute notifications preceding the saved session response. Missing-session cases with no captured payment still need operator recovery; no blanket timeout retry was introduced. Real merchant sandbox/network interruption acceptance remains pending.

## Caption wording correction, 2026-09-08

Studio now loads owner-scoped saved caption cues for free, shows timestamped editable wording in pages of 20, and submits corrections with caption style as a new version. Blank/oversized payloads are rejected; the worker requires the exact saved cue count and retains cue timing. Corrected metadata is persisted for subsequent caption versions. Private caption signing uses the dispatcher secret and a strict caption-key path; the owner action performs a bounded 512 KiB server-side fetch with HTTPS storage host/redirect restrictions. Late loads cannot update an unmounted editor.

Verification: **208/208 root tests**, **3 targeted worker/parser/dispatcher tests**, Convex typecheck, frontend/backend builds and AMD64 Linux image build passed. The network-disabled Linux smoke rendered corrected wording, confirmed a changed decoded video frame, unchanged decoded audio and full delivery decode, along with the existing caption/removal/archive/dispatcher checks. Logs: `/tmp/takeone-caption-words-full-root.log`, `/tmp/takeone-caption-words-worker.log`, `/tmp/takeone-caption-words-smoke.log`. These use synthetic media and mocked storage for API tests; real GCS/browser authenticated editing still needs staging acceptance. Cue timing/font/position editing and full reversible projects remain separate work.

## Shared render retry identity, 2026-09-08

The queue now compares normalized render inputs before returning an existing owner/request-ID job. Changed prompt, framing, source, caption style/wording or music mix raises REQUEST_CONTENT_CONFLICT before charge/insertion. Exact retries survive lease/status changes and catalog removal, retaining their original render and reservation. Comparison excludes catalog labels and evolving runtime fields; existing jobs need no fingerprint migration.

Verification: full root suite **210 tests passed**, followed by **23 queue/version tests passed** after adding the catalog-removal retry case. Convex typecheck passed. Tests prove one reservation on exact retries and no extra job/debit on conflicts. This is transactional local evidence; real multi-account cloud throughput remains pending.

## Deployment-specific Telegram onboarding and access recheck, 2026-09-08

Telegram linking and requests now require configured bot username/token/webhook secret and HTTPS APP_URL. Dashboard instructions name the configured bot, show linked/unconfigured state, hide consumed code instructions, and serialize connect/disconnect actions. Bot onboarding and pricing URLs use this deployment's app origin. Staging no longer hardcodes the production bot or frontend. Owner setup must verify TELEGRAM_BOT_USERNAME against getMe for the actual token.

Verification: full **214 root tests**, followed by the expanded Telegram suite with staging-origin assertions; Convex typecheck and frontend build passed. An earlier UI fixture failure was corrected to explicitly model configured Telegram. No production configuration or webhook was changed.

Fresh external access check: no remote Telegram test session was connected. `gcloud projects describe previous-unrelated-project --format='value(projectId)' --quiet` failed because the token requires reauthentication. These observations do not establish access to a Telegram test identity or the intended target GCP project. Cloud multi-user/latency acceptance remains pending; local implementation work continues.

## Caption placement, 2026-09-08

Studio supports top/middle/bottom placement, keeping a saved position or restoring the style default. A closed enum maps to ASS alignment and existing canvas-scaled margins; no arbitrary filter/ASS injection is accepted. New job versions store and inherit placement on subsequent web/Telegram caption restyles. Placement participates in request-content identity and reaches the managed renderer. Timing/audio remain unchanged; source-embedded text stays embedded.

Verification: **92 relevant web/API/Telegram/queue tests**, **3 caption worker/builder tests**, Convex typecheck, frontend/backend builds and AMD64 image build passed. Real network-disabled Linux smoke rendered moved captions, verified changed decoded frames and unchanged decoded audio, then fully decoded the output. Existing style, wording, removal, archive cleanup and dispatcher checks also passed. This is synthetic local media evidence; authenticated cloud edits, creator-footage quality and platform-specific safe-area preview remain pending. Log: `/tmp/takeone-position-smoke.log`.

## Telegram job listing and queued cancellation, 2026-09-08

`/jobs` lists only the linked account's five latest videos with status and matching deployment Studio links. `/cancel JOB_ID` shares the web cancellation helper, clearing queued/dispatched leases and restoring the reservation once. Running, completed or already-cancelled jobs cannot cancel; malformed/foreign IDs reveal no other account's data. Bot help and dashboard connection guidance describe these controls.

Verification: **219/219 root tests**, Convex typecheck and frontend build passed. Tests include owner isolation, duplicate Telegram delivery, repeated cancellation, running-state rejection and late claim/completion after dispatched cancellation. Real Telegram Web commands and multi-user latency remain pending a connected staging Telegram session. This does not cancel an already-running external provider request.

## Dashboard older-video access, 2026-09-08

The dashboard now uses owner-scoped reactive pagination, 20 videos per load, with a Load older videos control and loading state. Account-key changes reset accumulated pages; mismatched identity returns no data. The query caps page size at 50 and projects only tile fields, excluding transcript arrays and worker/lease state. The counter labels loaded videos rather than claiming a total.

Verification: **221/221 root tests**, Convex typecheck and frontend build passed. A 65-job test traverses beyond the old 50-job ceiling without duplicates or foreign-account results and verifies projection/page limits; UI tests cover authentication and load progress. Real signed-media browser performance still requires staging acceptance. Studio project-version history and payment history retain their separate older-record pagination gaps.

## Soundtrack-only premium/free branding, 2026-09-08

Fixed the Add selected soundtrack path clearing the free watermark together with unrelated operations. It now retains the reservation-derived watermark rule before mixing. Router-generated branding uses TakeOne rather than TakeOne. Pricing/onboarding clarify free-first allowance consumption, watermarked free renders and no added watermark on credit-funded renders; embedded source marks remain.

Verification: **25 gateway/router tests**, **39 UI tests**, frontend build and AMD64 worker image build passed. Real network-disabled Linux app.handle renders for free and paid soundtrack-only edits confirmed that only the free variant changes the decoded picture with branding, and both fully decode with audio. Existing caption placement/wording/archive and dispatcher smoke checks passed. Log: `/tmp/takeone-branding-smoke.log`. This is synthetic local media evidence, not cloud billing/provider acceptance. Choosing paid credits ahead of remaining free allowance is not implemented; current free-first policy remains.

## Saved-video Telegram delivery recovery, 2026-09-08

Studio now shows Telegram delivery state and lets owners retry a failed send without rendering or charging again. Manual retries add three attempts while preserving monotonically increasing attempt numbers; duplicates are idempotent and manual retry is throttled. Both automatic and retried delivery claims check that the original destination remains linked to the owner before starting network delivery. Unlinking after queuing prevents the next send; an already-in-flight request cannot be recalled.

Verification: **224/224 root tests**, Convex typecheck and frontend build passed; final Telegram tests additionally exercise all three retry attempts and the throttle. Tests prove stale responses cannot settle newer attempts, foreign/unlinked requests fail, balances/job count remain unchanged and the Studio button calls only delivery retry. Existing historical-delivery fixtures remain explicit for cross-account reply tests. Real Telegram Web delivery/retry and timing acceptance remain pending.

## Consolidated verification, 2026-09-08

Root suite: **224/224 tests passed**. Worker suite initially reported six timeouts and one stale paid-soundtrack assertion. Updated that assertion to require the explicit disabled watermark operation, preserving the existing paid-output behavior. The entire worker suite then passed **195/195** with one test worker in **67.68s**, and passed again with the standard two-worker `npm test` configuration in **50.33s**. The initial timeout cause was not established; neither rerun reproduced it. These are test-suite durations, not user video-generation latency.

Frontend build, Convex typecheck, backend typecheck and `git diff --check` passed. Lint reported zero errors and seven warnings. Both production dependency audits reported zero known vulnerabilities. Terraform's **eight mocked tests passed**; no cloud apply occurred. Logs for this pass are `/tmp/takeone-consolidated-*` on the development machine and are temporary evidence, not release artifacts.

No real Telegram, Dodo sandbox or cloud concurrency acceptance is implied by these results. Owner connection requirements remain in OWNER-CONNECTIONS.md. Nothing was deployed.

## YouTube ingest deadline and cancellation, 2026-09-08

The availability check, download attempts, retry backoff and metadata probe now share a cancellable ingest deadline derived from timeoutSec. The executor's earlier whole-job/lease signal still takes precedence. Already-cancelled work starts no availability subprocess. Backoff exits on cancellation rather than waiting twelve seconds. On POSIX workers, download termination kills the process group, including encoder children, and waits for downloader close before returning. Stderr buffering is bounded. Ingest.probe and ffprobe accept an optional AbortSignal; existing callers remain compatible. This does not add user cancellation of an already-running external model request.

Three regression tests failed against the previous implementation and passed after the fix. Seven new tests cover availability deadlines, cancellation before start/during download/during backoff, deadline exhaustion during backoff, and real local downloader/child-process shutdown under cancellation and timeout. The subprocess tests use a local substitute executable, not YouTube or a cloud provider. Worker typecheck, build and lint (zero errors, seven existing warnings) passed. Full-suite result is recorded below.

Full backend suite: **202/202 tests passed across 35 files**, standard configuration, **43.27 seconds**. Evidence logs: `/tmp/takeone-ingest-red.log`, `/tmp/takeone-ingest-process.log`, `/tmp/takeone-ingest-full-worker.log`. The Linux deployment image has not been rebuilt in this pass; cloud/Telegram acceptance remains pending.


## Visual trim selection and preview boundary, 2026-09-08

Studio now shows the selected time span and playhead, supports free seeking, exact current-player-time start/end marks, and keyboard-accessible boundary sliders synchronized with millisecond inputs. Dragging a boundary seeks and pauses the player. Seeking clears old preview bounds and resets playback speed. Only Apply sends the existing owner-scoped render request. Unknown/non-finite duration disables seeking/marking. Version changes clear selection/playback state.

Local browser testing initially observed a 7.875-second selection stop at 8.026 seconds with the old timeupdate-only handler. The shared useTimelinePlayer hook now checks the boundary on animation frames, pauses and positions the player at the requested boundary; timeupdate remains the fallback. Playback failures are fenced against newer previews and unmount cancels animation work. Browser screenshot/accessibility inspection confirmed the revised paused endpoint at 7.875 and the instruction `Trim 00:02.125 to 00:07.875`. This is not a guarantee of frame-exact playback on throttled/background browsers.

Full root suite: **234/234 tests passed**. New tests cover seek/mark isolation from billing, numeric/range synchronization, invalid boundaries/durations, Studio preview cancellation and exact mark reads, animation stopping and stale play rejection. Frontend build and lint passed (eight warnings, including the timeline cleanup-ref warning). Final targeted verification after avoiding animation-frequency Studio rerenders is recorded in the next line.

Real local pipeline execution of the browser instruction on the synthetic ten-second fixture produced **5.766667 seconds**, 1080×1920 H.264/yuv420p with AAC audio; full FFmpeg decoding passed. The nominal selection is 5.75 seconds; output follows source/encode frame boundaries. Artifact: `/tmp/takeone-visual-trim-acceptance.mp4`; log: `/tmp/takeone-visual-trim-render.log`. Local harness is under ignored `.superpowers/timeline-preview/`; it uses the actual TimelineControls and useTimelinePlayer. This verifies local component/playback/render behavior, not authenticated staging submission, creator-footage quality or cloud delivery. Frame-index controls, thumbnails/waveforms, and cloud acceptance remain pending.

Final targeted UI/player suite after the animation optimization: **56/56 passed**; frontend build and diff whitespace check passed.


## Creator-owned audio upload and mixing, 2026-09-08

The web music picker now accepts MP3/WAV/M4A audio up to 20 MiB with an explicit exported-video rights confirmation, upload progress/cancel, free preview and removal. Audio uses the existing five/hour and ten-ready total source limits shared with video. Finalization now rechecks ready-source capacity to close concurrent-begin oversubscription. MIME/actual storage size must match, and audio cannot be submitted as a video source.

Owner-only audio entries appear beside approved catalog tracks in web and linked Telegram `/music`. Render admission validates ownership/readiness before reserving allowance and snapshots the storage ID/mix settings; an indexed source reference prevents deletion during queued/dispatched/processing work. Claimed workers receive a storage URL. Both normal/edit and AI mix paths share a bounded 20 MiB downloader with cancellation, HTTPS Convex storage URL constraints and redirect rejection. Corrupt audio is still checked by the actual media mixer; file MIME is not media-content proof.

Listings/URL issuance are owner-scoped. Convex storage URLs themselves are bearer-accessible and are not expiring GCS signatures. Deletion removes the source while completed exports keep their embedded audio. Transport byte limits, orphan cleanup and real authenticated storage/upload acceptance remain pending. Audio can be uploaded on the web and selected in Telegram; direct Telegram audio-message ingestion is not implemented.

Root suite: **244/244 passed**. New tests cover rights/type/size/finalization, shared capacity, owner-private listing/preview, source-kind isolation, admission/replay/deletion protection, claimed URL, and Telegram reuse. Eight worker download tests passed, including a deceptive content-length and disallowed URL sources. The first broad backend run had 208 passing tests and two existing subprocess-startup fixture timeouts; both passed in isolation. A separate single-worker suite recheck is recorded below.

Real local acceptance used actual M4A bytes through downloadSoundtrack and the app's Add selected soundtrack path. The HTTP transport was mocked; bounded file streaming, music mixing and full FFmpeg decoding were real. Result: **10 seconds**, 640×360 H.264/yuv420p with AAC audio, matching source duration and dimensions. Artifact `/tmp/takeone-owned-audio-acceptance.mp4`; log `/tmp/takeone-owned-audio-render.log`. This does not prove cloud upload, real Telegram playback or creator-quality music selection.


Backend recheck investigation: the single-worker run took 2,379.77 seconds and reported five failures (three media/network timeouts and two subprocess startup fixtures), with 205 passing. macOS power logs confirmed repeated sleep from 10:51 through 11:29 during that run. Both subprocess fixtures had passed alone in 3.81 seconds. A fresh sequential validation was started with a command-scoped idle-sleep assertion; no production limits or test timeouts were increased. Convex typecheck, frontend build and backend build passed. Lint reports zero errors and eight warnings.

Final awake backend run: **210/210 tests passed across 36 files in 61.53 seconds**, using one test worker. The command-scoped idle-sleep assertion ended with the successful test process. Log `/tmp/takeone-owned-audio-worker-awake.log`. This supersedes the interrupted local run as the current regression result without erasing its recorded failures. No cloud deployment or live Telegram/Dodo acceptance occurred.


## Abandoned Convex storage cleanup, 2026-09-08

Internal `storageCleanup:run` now scans up to 100 storage metadata records per minute, persisting cutoff/cursor and aggregate counts. Default mode is audit-only; off skips all scans, and explicit delete mode removes only blobs older than 24 hours that have no upload, video-source or soundtrack-source reference. All job statuses are protected. Saved sources and completed exports are not expired. A stable paginated sweep reaches candidates beyond protected older files; changing mode starts a new sweep. Internal status returns counts/progress without object IDs, names or URLs.

Reference checks and deletes share a Convex mutation. Ten new tests cover internal registration, audit/delete/off/invalid modes, exact grace-period boundary, all reference classes, references added after audit, pagination/mode reset, fresh finalization overlapping cleanup, expired finalization on either side of deletion, and repeat-safe deletion. Tests initially needed a fixture correction because Blob objects cannot cross Convex function return serialization; boolean existence checks now verify live bytes.

Verification: **254/254 root tests passed across 22 files**, Convex typecheck, frontend build and lint passed (zero errors, eight warnings). No backend media code changed in this pass, so no additional render test was required. Test deletion used isolated convex-test storage only; no real cloud or production files were deleted. Default audit and status still require an actual staging sweep before enabling delete mode. See infra/README.md for deployment-specific enablement and pause instructions. GCS incomplete-worker artifacts, transport upload limits and real cloud cleanup acceptance remain pending.


## Complete Studio version history, 2026-09-08

Studio now pins the original in the history list and pages edits in groups of 20 with Load older edits and loading states. The new owner-scoped listVersions query validates both selected-job and root ownership, account-key matching and a maximum 50-item page. It returns only display metadata. The compatible versions query has an optional root-only mode used by Studio; its legacy default still returns at most 50 edits, but the current UI no longer uses that truncated list.

Verification: **257/257 root tests passed**, Convex typecheck and frontend build passed; lint has zero errors and eight warnings. A 65-edit fixture traverses all pages without duplicate, foreign or private worker/transcript fields; tests cover malformed IDs, foreign roots, account mismatch, page bounds and read-only UI loading. The original link remains available and opening it remains free. Account/selected-job changes reset pagination; navigating to another version may require loading older pages again. Payment history pagination remains pending. No worker media or billing behavior changed, and actual authenticated staging browsing remains unverified.


## Complete purchase and checkout history, 2026-09-08

Pricing now loads purchase/checkouts in pages of 20 with an explicit Load older purchases control and loading state. Required account-key matching and authentication scope both stored records and client page accumulation. The query caps pages at 50 and shares the existing history projection: paid amount, refund amount/credits, dispute state and resume eligibility remain visible, while provider/session identifiers and checkout URLs are excluded. The legacy 25-row history query remains for compatibility; the UI uses listHistory.

Verification: **260/260 root tests passed across 23 files**, Convex typecheck and frontend build passed. Lint reports zero errors and eight existing warnings. A 55-order fixture verifies every order is reachable exactly once, including an older partial refund, without foreign records or balance changes. UI tests verify free load-more, loading/disabled state, authentication reset and preserved existing status/recovery controls. A JSX syntax error caught by the initial build was corrected before the successful final suite.

No checkout, reconciliation, refund or credit-grant behavior changed; no Dodo call or real payment occurred. Real merchant sandbox/account acceptance and unresolved billing policy/operator recovery gates remain pending.

## Checkout page/account lifetime, 2026-09-08

Three regression tests demonstrated stale create/resume redirects after leaving Pricing and a pending checkout surviving an account switch. Pricing now remounts its content on account changes and guards creation/resume callbacks with page lifetime. Stale successes cannot navigate; stale failures cannot clear retry storage or overwrite current UI. Current-session redirects still work. This does not cancel an already-running server/provider action; its order remains available through existing owner-scoped recovery.

Verification: **266/266 root tests passed**, frontend build and lint passed (zero errors, eight warnings), and diff whitespace check passed. Three tests failed before the guard and passed afterward; additional tests cover valid create/resume navigation and late-failure retry identity preservation. Navigation is observed through a mocked browser boundary; no Dodo hosted page or real payment was opened. Server billing/provider behavior is unchanged, and real sandbox acceptance remains pending.


## Refreshed Linux deployment-container acceptance, 2026-09-08

Built the current backend as Linux/AMD64 and ran scripts/container-smoke.sh with Docker networking disabled. The full smoke passed (exit 0): actual H.264/AAC rendering and full decode, clean/meme/karaoke captions, durable clean archive, restyling/removal/word correction/placement with frame and audio comparisons, paid/free soundtrack branding, owned-audio download-to-file and actual mixing, Linux downloader/encoder-descendant cancellation, dispatcher health 200 and unauthenticated dispatch 401. The owned-audio HTTP response was substituted with actual WAV bytes; Linux file streaming, FFmpeg processing and process cancellation were real. No YouTube, model, Telegram, payment or cloud request was exercised.

Image: takeone-acceptance-amd64, manifest sha256:380ae48017e8e488afb0415c121a6f74d075a2dcbe36aa28a498d91cbd1ee67b. Build log: /tmp/takeone-container-refresh-build.log. Smoke log: /tmp/takeone-container-refresh-smoke.log. Shell syntax validation passed. Root 266/266 and backend 210/210 remain the latest full-suite results; this pass changed the container smoke coverage only.

Access recheck: gcloud project inspection still fails because credentials require reauthentication. No remote Telegram test session was connected. Docker Desktop was started locally for this validation. No production deployment, payment or external message occurred.


## Download destination ownership fix, 2026-09-08

A failure-path audit found boundedDownload unconditionally removed its destination after exclusive creation failed. Two tests reproduced deletion of a pre-existing regular file and symlink. Cleanup now requires the destination stream's open event, so it only removes a file created by this invocation; already-aborted downloads create nothing. Pipeline remains attached synchronously to source/destination errors. Five added tests cover both collision types, pre-abort, input failure and cancellation during streaming; existing size-cap and valid-byte checks remain.

Verification: **215/215 backend tests passed across 36 files in 90.88 seconds**, backend build and whitespace validation passed. Linux/AMD64 network-disabled execution with the newly compiled files.js mounted read-only into the prior acceptance image also passed real-file collision, symlink and oversize cleanup checks. This was a mounted-module check, not a newly rebuilt image. Logs: /tmp/takeone-download-ownership-{red,worker,linux}.log. Root suite remains the previously verified 266 tests; no frontend/Convex changes in this pass.

This fixes worker-local download cleanup only. GCS orphan/retention cleanup, actual cloud deployment, Telegram multi-user acceptance and provider/payment sandbox gates remain pending. No external files or production services were modified.


## Internal operational condition visibility, 2026-09-08

operations:snapshot is an internal-only read-only query using five indexed first-row probes for oldest queued work, expired dispatched/processing leases and failed Telegram video/text deliveries. Queue warning starts above five minutes; missing legacy active leases are detected. New status/createdAt and status/lease indexes avoid history scans. operations:logHealth emits an aggregate-only structured log every five minutes, including clear observations. No identifiers, prompts, URLs, tokens or provider errors are projected. Failed delivery flags include historical unresolved failures; these are not counts, failure rates or a general uptime/readiness claim. No outgoing alerts or remediation are added. infra/README.md documents interpretation, staging validation and remaining monitor routing.

Five new tests passed: internal registration/empty state, insertion-vs-createdAt ordering and exact threshold, lease boundary/legacy/terminal handling, failure resolution/read-only behavior, and exact log redaction. Initial Convex generic index typing error was corrected; typecheck passes. Lint passed with eight existing warnings. Full root run: **270 passed, one existing UI timeout** during competing local test workloads (79.10s); the entire affected UI file then passed **49/49 in 2.39s**, with no timeout/configuration increase or UI code changes. Logs: /tmp/takeone-operations-{targeted,root,ui-recheck,lint}.log. Backend remains the separately verified 215 tests; no media/worker changes this pass.

Scheduled logs and new indexes have not been deployed or observed in real staging. Alert transport/delivery, missing-heartbeat monitoring, operator acknowledgement, GCS orphan cleanup, provider readiness and real Telegram/cloud acceptance remain pending.


## On-demand timeline frame previews, 2026-09-08

Studio now offers eight sampled 160x90 JPEG previews, loaded only on request with one sequential detached decoder. Aspect is preserved; the four-column layout was enlarged after actual browser inspection. Clicking a sample seeks the existing player without submitting a render. A ten-second event deadline and 45-second overall deadline bound stalled extraction. Cancel, unmount and URL-keyed source replacement abort work; decoder source/canvas are released. CORS/expired-link failures leave seek/trim usable with retry guidance. Preview images stay in component memory. These are samples, not frame-index editing.

Terraform adds exact configurable HTTPS web_origins (defaults takeone.web.app and www), GET/HEAD-only bucket CORS and preserves private access prevention. Staging must configure its own origin and verify actual signed-URL pixel access; no bucket was changed. Google Cloud CORS configuration documentation was checked and linked in infra/README.md.

Real local browser acceptance used actual TimelineControls, FramePreviews, extractVideoFrames and useTimelinePlayer against the existing ten-second synthetic MP4. All eight images decoded and were visually inspected. Selecting 5.625 and 9.375 seconds moved the player and marked matching start/end values; no paid submission occurred. The harness is ignored .superpowers/timeline-preview on localhost:4322. This verifies browser decoding/selection, not authenticated Studio or signed-GCS CORS.

Verification: full root **276/276 tests passed**; then three additional decoder lifecycle tests passed, covering in-progress abort, stalled metadata timeout/cleanup and pre-cancel avoiding decoder creation. Four UI tests cover request-only loading/seek, cancel/retry, source-remount stale-result rejection and disabled/failure states; sample boundary tests also pass. An initial test hook incorrectly returned a mock function (treated as teardown); it was corrected before green verification. Final frontend build passed, lint has zero errors/eight existing warnings, and **10/10 Terraform mock tests passed**. Logs /tmp/takeone-frame-{root,cleanup,final-build,lint,tf}.log. No backend/media rendering code changed.


## Bounded webhook ingress, 2026-09-08

Telegram and Dodo HTTP routes now enforce actual UTF-8 byte limits while streaming into fixed-size buffers (64/256 KiB), instead of reading unlimited Request.text and checking character length afterward. Excess declared length is rejected early; false/missing headers cannot bypass streamed checks. Body timeout is ten seconds; oversize/invalid/stalled input returns 413/400/408, cancels the stream, releases its lock and clears timers. Authorization and disabled-integration gates remain before reading. Exact valid UTF-8 text is retained for Dodo signature verification; malformed encoding is rejected without normalization. No raw upstream errors are returned.

Verification: **288/288 root tests passed across 28 files in 64.29s**, including nine new body/route cases for split Unicode, BOM/CRLF preservation, false/absent lengths, declared excess, invalid bytes, timeout, upstream failure cleanup and pre-body gate ordering. Convex typecheck and lint passed (zero errors/eight existing warnings). Logs /tmp/takeone-webhook-body-{root,types,lint}.log. No worker/frontend rendering code changed.

Real hosted ingress and Telegram/Dodo retry acceptance remain pending. Direct Convex storage upload transport caps and general IP rate limiting are separate unresolved concerns. No cloud deployment, payment or outbound message occurred.


## Incomplete artifact bundle cleanup, 2026-09-08

Worker output uploads now use an extracted uploadArtifacts helper with create-only generation preconditions and one unique ownership marker per bundle. If an upload fails before finalization, it inspects only attempted keys and removes only matching owned generations using conditional deletion. Existing colliding objects cannot be overwritten; changed/missing ownership or failed metadata/deletion preserves objects. Aggregate logs contain counts only. The original upload error survives cleanup/logger failures. Archive references are assigned only after the full bundle succeeds. Successful bundles and uncertain/rejected completion remain outside cleanup.

Verification: **221/221 backend tests passed across 37 files in 122.46s**, backend typecheck/build and lint passed (eight existing warnings). Six new tests use real local streams plus a simulated object store: success, committed write followed by response loss, collision ownership, replacement between inspection/deletion, metadata/logger failure, and pre-abort. Existing worker uncertainty tests passed. SDK types/source and official GCS precondition semantics were checked; actual GCS deletion was not performed. Logs /tmp/takeone-artifact-cleanup-{targeted,worker,build,lint}.log. Root remains separately verified 288 tests; no frontend/Convex change this pass.

This is best-effort immediate partial-upload cleanup, not a historical bucket sweep or saved-output retention policy. Forced termination, loss after successful upload, uncertain completion and provider intermediate objects still need durable reconciliation. Cloud IAM/retention/conditional-delete acceptance and refreshed deployment image remain pending. No cloud files or production service were changed.


## SDK deletion fencing and refreshed Linux image, 2026-09-08

The installed GCS SDK performs an implicit File.delete on checksum mismatch. A new loopback HTTP regression using the real SDK reproduced an unconditioned DELETE despite the createWriteStream precondition. Uploads now put ifGenerationMatch=0 on the File instance as well, causing the implicit delete to fail closed. Explicit bundle cleanup still checks the upload marker and deletes only the matching generation. Checksum validation remains enabled. Two actual-SDK HTTP cases verify POST precondition, fenced implicit deletion, owned cleanup, and preservation of an object replaced by another writer. Server responses emulate GCS; no actual cloud request is made.

Final focused suite: **19/19 passed** (artifact helper, worker lifecycle and real-SDK HTTP cases). Linux/AMD64 production image rebuilt successfully; network-disabled smoke passed real renders, all caption/archive/branding checks, owned-audio mixing, downloader/encoder cancellation and dispatcher health/auth. Image manifest sha256:df71042063d8d9b9c47cecebdf7b6e234d881de8047306b95591357680cea566. Lint passes with eight existing warnings; whitespace check passes. Logs /tmp/takeone-sdk-cleanup-{red,final,lint}.log and /tmp/takeone-sdk-container-{build,smoke}.log. The previous 221-test full worker run predates this two-case addition; it is not relabeled as a newer full run.

Cloud conditional-delete/IAM acceptance, historic orphan reconciliation, real Telegram/provider acceptance and deployment remain pending. Nothing was deployed or deleted in GCS.


## Live provider acceptance and compatibility fixes, 2026-09-08

Read-only authenticated checks returned HTTP 200 for the configured model, Whisper model and ElevenLabs account. Actual local requests then exposed two production blockers: script generation returned 400 unsupported_value for temperature, and a 200 Whisper response contained recognized words with identical start/end timestamps that our strict parser rejected. Script calls now omit the optional sampling override (the other model callers already omit it). Timing normalization preserves zero-length recognized words by merging shared-start tokens or using short display intervals bounded by the next start and provider duration; it requires positive timing anchors and leaves reversed/unordered/unanchored timing invalid. It does not claim repaired intervals are precise speech boundaries.

The final actual script -> ElevenLabs voice -> Whisper chain passed with HTTP 200 at each stage: script **5,614 ms**, voice including conversion **1,755 ms**, transcription **4,287 ms**. These are one local run, not p50/p95, cloud queue or concurrent-user measurements. Local secrets were used only with their configured providers; no values are printed or copied into documentation. Evidence /tmp/takeone-live-provider-evidence.json, log /tmp/takeone-live-provider-chain-final.log, narration /tmp/takeone-live-narration.m4a. Earlier failures and diagnostic logs remain separate under /tmp/takeone-live-provider-chain.log, /tmp/takeone-live-provider-chain-fixed.log and /tmp/takeone-live-transcription-diagnostic.log.

The returned narration/cues were rendered with strict captions in the Linux container, networking disabled: **24.542 s, 720x1280, H.264/yuv420p/AAC**, full decode passed; render time **5,763 ms**. Output /tmp/takeone-live-caption-output/check.mp4 and frame.png were inspected; solid-color visuals are deliberately labeled LIVE PROVIDER TEST. This is a provider/caption test artifact, not an investor-ready creator video. Native macOS rendering could not burn subtitles (known missing libass); the first Linux harness also incorrectly assumed prepareDelivery always copied its output, corrected by using the returned path. No additional provider requests were needed for render retries. The container caption renderer was unchanged; its image predates the new host-side script/transcription fixes.

Connection audit: GCP project inspection still fails reauthentication. Configured local Telegram token returned 404 for both getMe and getWebhookInfo; no webhook/polling/messages were changed. No local stock-provider key exists. Promote working local model/voice/transcription credentials to staging; connect the intended Telegram bot, GCP, matching frontend/backend, stock/music assets and Telegram test accounts. Actual cloud jobs, ten-user latency, Telegram deliveries, payment sandbox, realistic AI scenes and creator-footage/music QA remain unverified.

Targeted script/transcription tests **27/27 passed**. First broad backend run: 224 passed/two recurring real-process fixture startup failures. Those tests now hold the main deadline clock until a real downloader/encoder is confirmed running, then advance the deadline; real child execution and polling remain real. Production timeouts were not changed. Cancellation-focused suite **7/7 passed** in 1.10s. A final full worker regression is recorded below when complete.

Regression follow-up: the next full run passed 225 tests but the old invalid-YouTube-URL test exceeded its 60-second test timeout while its ingest budget allowed 120 seconds. That network-dependent error test was replaced with a deterministic availability-success/two-download-failure simulation that asserts one retry and a clear IngestError. Real upload/probe and subprocess cancellation tests remain; live YouTube clipping is still explicitly pending. All **14 ingest tests passed**.

Final regression after provider and fixture fixes: **226/226 backend tests passed across 39 files in 143.13 seconds**. Backend build and lint passed (zero errors/eight existing warnings); whitespace validation passed. Root remains separately verified 288 tests. Log /tmp/takeone-live-fixes-worker-verified.log. The production image must be refreshed to include these latest script/transcription changes before deployment. No production/cloud state was changed.


## Bounded and cancellable stock downloads, 2026-09-08

Stock searches and both b-roll/cutaway callers now propagate the job signal. Downloads stream through the existing byte-cap helper (50 MiB actual bytes), verify positive-duration video metadata, then atomically rename a unique partial file into a versioned cache. Historical unvalidated filenames are ignored. Failed metadata, oversized bytes and cancellation remove owned partial files; pre-existing temporary-file collisions are preserved. Concurrent same-key requests may still download twice, but cannot read each other's partial cache output. Provider failures return null; job cancellation propagates.

Final verification: **234/234 backend tests passed across 40 files in 38.53s**, backend build and lint passed (eight existing warnings). Eight focused tests cover caps with misleading lengths/bounded read-ahead, real file publication, caching, invalid metadata, search/stream cancellation, concurrent same-key requests, legacy/pre-abort and temporary collisions. Real local MP4 bytes were streamed, probed and reused without a second download; result 10s 640x360 H264/AAC. HTTP was mocked; filesystem and FFprobe were real. Log /tmp/takeone-stock-real-stream.log.

The first full run overlapped the final cleanup edit and saw a mixed source/test snapshot (233 passed/one collision failure). The unchanged final-source rerun above is authoritative; focused collision tests also passed. Final logs /tmp/takeone-stock-{worker-final,build-final,lint-final}.log. Root remains the previously verified 288 tests. No actual stock-provider API, GCS, Telegram or deployment call occurred. Live stock selection/licensing, redirect/address security review, full media quality and staged cancellation remain pending. Strict cutaway behavior when no footage is available still warrants an acceptance check; this pass did not change its fallback policy.


## Strict cutaway fulfillment, 2026-09-08

Production cutaway edits now reject missing footage, partial fulfillment and an empty effective selection before rendering. Explicit offline mode retains passthrough behavior. Available footage retains the original audio mapping. A worker regression verifies that missing footage reaches durable failure handling without uploading or completing; actual credit/refund delivery remains part of staging acceptance.

Verification: **240/240 backend tests passed across 40 files in 30.84s**. The focused 45-test suite, backend build and lint passed (zero errors/eight existing warnings). Six new cases cover missing/partial/all-available footage, offline passthrough, empty selection and worker failure handling. The first positive test had an incorrect segment fixture shape; it was corrected to the actual at/dur contract before green verification.

A real FFmpeg render inserted locally generated blue footage into the sample video. Full delivery decode passed and decoded source/output audio hashes matched exactly. The frame at three seconds was visually inspected and shows the expected blue cutaway. Stock HTTP responses were mocked; streaming, FFprobe, rendering and audio verification were real. Artifact /tmp/takeone-cutaway-output.mp4; frame /tmp/takeone-cutaway-frame.png. Logs /tmp/takeone-cutaway-real-render.log and /tmp/takeone-strict-cutaways-{worker,green,build,lint}.log.

This resolves the prior no-footage fallback gap locally. Real stock-provider selection, licensing and staging retries/refunds remain pending. The production container must be rebuilt to include this and the recent provider/download fixes. Root remains separately verified at 288 tests; no frontend/Convex code changed in this pass. Nothing was deployed.


## Refreshed production container acceptance, 2026-09-08

Rebuilt the Linux/AMD64 image from the current backend, including live-provider compatibility, bounded stock downloads and strict cutaway fulfillment. Image manifest list: `sha256:bf6749ab78887325d8666f53bab7a2b63d5e9d104a09eee79d94f5a0793f6cfa`; AMD64 manifest: `sha256:05d7d7a3b6b2cd0fff4773bce9f17f3077c881bb7b1625217ad0d73d48b7be3b`. These identify local artifacts; no registry push or deployment occurred.

The complete network-disabled container smoke passed using the same read-only mounted script invocation as CI. It verifies actual caption renders/decode, clean archive survival, caption removal/restyling/wording/placement, soundtrack mixing/free branding, owned-audio download and mix, real process-group cancellation, and packaged dispatcher health/unauthorized rejection. Stock HTTP is substituted with local MP4 bytes: the actual compiled downloader/probe/cache/render path changes the sampled source frame and preserves its decoded audio hash; missing stock is rejected. This stock test is now retained in scripts/container-smoke.sh and therefore included in the existing CI container job.

Two preliminary harness runs failed: the initial one-second fixture had no valid cutaway window; it was replaced by a five-second source. Piping the shell script through container stdin then allowed media tools to consume script bytes, causing a JavaScript syntax error; the mounted-script CI invocation resolved that without changing production code. Final build and mounted-smoke commands exited zero. Logs /tmp/takeone-latest-container-build.log and /tmp/takeone-latest-container-smoke-mounted.log. The earlier failed harness logs remain separate.

This refresh resolves the stale local image gap. Actual GCP execution/IAM, signed storage URLs, stock-provider quality/rights, multiuser Telegram Web and cloud concurrency/latency remain pending. No runtime credentials were supplied to the container and networking was disabled throughout the smoke.


## Reaction sticker reliability and responsive layout, 2026-09-08

GIPHY downloads now propagate parent cancellation, cap streamed bytes at 20 MiB, verify positive-duration GIF metadata and atomically publish unique owned partial files to a versioned cache. Search/download deadlines remain 15/30 seconds. Invalid or excessive downloads are not cached; pre-existing temporary collisions are preserved. Production rejects missing or empty effective sticker selections instead of silently copying the original. Explicit offline fallback remains.

The old fixed 380px width and y=360 position could place stickers outside small landscape videos. Relative placement and a bounded aspect-preserving box now keep overlays inside landscape, square and portrait canvases. Actual native FFmpeg tests passed on 320x240, 720x720 and 720x1280 five-second fixtures: expected red sticker pixels are visible at the selected time, full delivery decode passes and decoded source/output audio hashes match. Small-landscape and portrait frames were visually inspected. HTTP was mocked; GIF bytes, streaming, probing, rendering and filesystem operations were real. Artifacts/logs /tmp/takeone-sticker-render and /tmp/takeone-sticker-render.log. These are synthetic fixtures, not creator-quality or live-GIPHY acceptance.

Final backend regression: **253/253 tests passed across 41 files in 93.50s**. Focused suite 47/47, backend build and lint passed (eight existing warnings), whitespace check passed. Nine download cases cover publication/cache, misleading byte lengths, invalid/non-GIF content, search/stream cancellation, concurrent cache readers, legacy cache/pre-abort and temporary collisions. Four strict-media cases cover missing, available, offline and empty sticker selections. The initial unbounded-download stress run was stopped; the producer was subsequently capped at 32 MiB so regression against unsafe code cannot exhaust memory. One focused run failed its old fixed-position string expectation, updated for the intentional responsive layout. Logs /tmp/takeone-sticker-{focused-final,worker,build,lint}.log.

The repeatable CI container script now adds a real GIF stream/render, checks an in-frame red pixel and unchanged decoded audio, and requires missing footage rejection. GIPHY_API_KEY is marked in the owner connection checklist. Actual provider selection, rights, quotas and staged cancellation remain pending. Root frontend/Convex source is unchanged; its previous 288-test verification is separate.

Final Linux/AMD64 image `sha256:7fc6f4dcca9c92836f4934c0e702e0c25e57f5264cf753446c8d7e783b296a27` includes the sticker fixes. The full network-disabled mounted-script smoke exited zero, including the new GIF pixel/audio/missing-footage checks, all existing caption/archive/music checks, actual child-process cancellation and dispatcher health/authentication. Logs /tmp/takeone-sticker-container-{build,smoke}.log. No cloud credentials, registry push, deployment or Telegram message occurred.


## Bundled caption font presets, 2026-09-08

Studio caption restyling now offers Sans, Serif and Mono with Keep saved font as the default. Presets map to the container's DejaVu families; arbitrary names and paths are rejected. Optional captionFont persists in jobs, request identity and worker claims. Subsequent caption edits inherit the source font unless overridden, including removal/restyle sequences. Timing and speech are unchanged. Telegram supports exact reply commands such as captions clean serif; invalid fonts/mixed commands do not spend. Initial-generation font defaults remain unchanged.

Verification: **294/294 root tests across 28 files in 12.77s** and **255/255 backend tests across 41 files in 56.87s**. Frontend/worker builds, Convex typecheck and lint passed (eight existing warnings); whitespace passed. Added server font identity/inheritance, invalid-before-debit/worker-claim and Telegram choice/inheritance cases; updated Studio interaction test; added ASS family/injection and actual restyle forwarding/cancellation tests. Focused root 99/99 passed before full regression. Logs /tmp/takeone-font-{root-full,worker-full,web-build-final,convex-final,lint-final}.log.

Actual CaptionRestyle component inspected in the local browser harness at localhost:4322/.superpowers/font-preview. Selected Serif and applied; visible output was {"style":"clean","font":"serif"}. Screenshot inspected. Callback is local-only, no backend render/debit. This verifies the browser control, not authenticated staging.

Rebuilt Linux/AMD64 image manifest list `sha256:83cd4e9f41e4a68ebc03eae72d90c60624a07af22fd3881c03681355bf1c999b`. Full network-disabled mounted-script container smoke passed, including new real libass rendering for all three font families, distinct decoded frames, unchanged decoded audio and full delivery decode. Three resulting frames were visually inspected. Outputs /tmp/takeone-font-container-out/font-{sans,serif,mono}.{mp4,png}; build/smoke logs /tmp/takeone-font-container-{build,smoke}.log. Font checks remain in the existing CI container script.

No font API connection is needed. Deploy matching schema/worker/frontend together for staging acceptance. Real web/Telegram/GCS delivery, cloud multi-user capacity, creator-footage QA and the other top-table gates remain pending. No registry push, deployment, real payment or Telegram message occurred.


## Internal payment review investigation, 2026-09-08

Added internal-only paymentReview:list/detail/disputes queries. Order queues use new environment+review/error+creation indexes, oldest-first pagination and a 1 to 50 row limit. Supported queues are disputes, missing-session review and provider-check failures. Detail uses an explicit projection with saved payment/session references, purchase/refund credits/amounts and reconciliation timestamps. Account identifiers, checkout bearer URLs and raw provider errors are excluded. Dispute pages are order/environment-bound and reject conflicting payment bindings; provider amount strings remain exact with explicitly unverified units. Views neither mutate data nor call providers and do not clear review flags.

Six new tests passed, including 65-order and 55-dispute multi-page fixtures, test/live and case isolation, internal registration, invalid page sizes, binding rejection, projection/privacy and unchanged order/account balances. **300/300 root tests passed across 29 files in 26.11s**. Convex typecheck, frontend build and lint passed (eight existing warnings); whitespace passed. The first typecheck caught generic Convex index-builder typing and closure narrowing; final code follows existing query-builder typing and narrows the queue kind before callback construction. Logs /tmp/takeone-review-{focused,root-full,types-final,build,lint}.log.

The local CLI help confirms the explicit --deployment flag; staging operator examples are in infra/README.md. No query was run against a real deployment and the new indexes remain undeployed. Backend/media source did not change; its separately verified 255-test suite and last font-enabled image are not relabeled as a new worker run.

This is investigation support, not full dispute resolution. The owner was asked whether credits should be held while open or adjusted only after confirmed loss; no answer/default was assumed. Amount-unit sandbox verification, atomic refund/dispute overlap accounting, provider-state revalidation, authorized immutable resolution audit and actual sandbox/cloud acceptance remain pending. Checkout/reconciliation enablement flags remain unchanged. No payment, balance, webhook, production deployment or outbound message was changed.


## Editable caption layers on planned sticker reels, 2026-09-08

The planner previously appended GIFs after captions, causing the managed archive's correct provider-replay guard to skip the editable layer. Planned GIFs now render immediately before captions, so the captured clean base already includes the exact selected sticker. Captions appear above the sticker where areas overlap. The archive replay allowlist is unchanged. Older exports without a clean/timing archive remain uneditable; this fixes new planned renders.

The focused regression reproduced false archive eligibility on the prior order (24 passed/one failed), then passed with the new order. Focused planner/archive suite **27/27 passed**. Full backend **255/255 tests across 41 files passed in 58.63s**, backend build and lint passed (eight existing warnings), whitespace passed. Logs /tmp/takeone-sticker-layer-{red-final,focused,worker,build,lint}.log. Root remains its separately verified 300 tests because frontend/Convex source is unchanged.

The retained container scenario uses the real planner, executor, GIF downloader, caption archive and restyle functions. A generated GIF and five-second source fixture pass through actual FFmpeg/libass with only HTTP substituted. The new scenario checks one archive creation, exactly one search plus one GIF download, removal leaving the expected red sticker pixel visible, captioned/removed frame difference, unchanged decoded source audio, full delivery decode, and restyling with no provider refetch. The full refreshed-container result follows below.

Final refreshed Linux/AMD64 image `sha256:200a2ce9ac19bbfba979d109e32141c9c16a231cc2b74ec9471cd25f48a583a0` built successfully and the complete network-disabled mounted-script smoke exited zero, including sticker/caption archive, fonts, music, cancellation and dispatcher checks. Logs /tmp/takeone-sticker-layer-container-{build,smoke}.log. Actual GIPHY, hosted archive storage/delivery and web/Telegram subsequent-edit acceptance remain pending. No registry push, deployment, credit change or message occurred.


## Entitlement branding on clean caption archives, 2026-09-08

Platform watermark operations now carry an explicit internal platform marker at router, soundtrack-only and worker-finalization construction points. New clean caption archives skip only those marked operations. Ordinary creator watermark operations, even with matching text, and source-embedded pixels are preserved. The public export still receives reservation-derived branding. This avoids repeating the free watermark on caption edits and allows new credit-funded restyles to use the unbranded clean source. Older archives with embedded marks are not retrofitted.

A real-file regression failed on the prior archive replay, then passed after the change. Focused archive/gateway/music/entitlement suite **21/21 passed**, backend build and lint passed (eight existing warnings). The full backend run reported **253 passed/three failed across 41 files in 345.86s**: two existing integration test timeouts (40/120 seconds), and one generation returning a text error rather than a file. Other local workloads and active slow FFmpeg children were observed, but the exact cause of the text error was not established. The unchanged integration file then passed **3/3 in 46.56s** with no timeout changes. These results are separate, not a fabricated all-green full run. Logs /tmp/takeone-caption-brand-{red,focused,worker,integration-recheck,build,lint}.log.

Strengthened the public-download test with paired clean/caption archive keys and an exact signed-request assertion: only the finished video key is signed. Ownership remains enforced. All **19 jobs tests passed**; log /tmp/takeone-caption-brand-downloads.log. No Convex production source changed. Root's prior 300-test run is separate from this focused test update.

The new container scenario compares real frames for an initial free export, its private unbranded clean archive, a free caption re-export (one watermark) and a credit-funded caption re-export (no added watermark). It also checks unchanged decoded audio and delivery decode. The refreshed full container outcome follows below.

Final Linux/AMD64 image `sha256:040b56ecd3c8673b188775c9842e34845e10f79013d88dffa420561b13a66110` built successfully. Full network-disabled container smoke exited zero, including exact free/paid branding frame comparisons, audio preservation, clean archive, sticker/caption/font/music checks, cancellation and dispatcher health/auth. Logs /tmp/takeone-caption-brand-container-{build,smoke}.log. Cloud entitlement/storage delivery and legacy archive migration acceptance remain pending. No registry push, deployment, credit mutation or message occurred.


## Caption-preserving ordinary edit chain, 2026-09-12

Ordinary owned-source edits now derive a paired clean-video/timed-caption source
on the server. Web and Telegram jobs carry an internal caption-transform flag,
the request fingerprint includes it, and worker claims preserve the inherited
style, font and placement. The worker routes the ordinary instruction against
the clean source, retimes saved cues through trim/clip/speed, burns captions once
after the final canvas transform and writes a new paired archive. No speech
transcription is requested. Empty-speech trims export an empty valid archive.
Free-form caption instructions are directed to structured caption controls before
admission, so that rejection spends no generation.

Earlier fresh verification on this exact source completed with **304/304 root
tests** and **260/260 backend tests**, both builds, Convex typecheck and lint.
During the resumed validation, focused Studio/server/Telegram coverage passed
**4/4 selected cases** and caption-transform media coverage
passed **4/4**. A concurrent broad rerun was stopped after unrelated existing
payment, Telegram, integration and process-cancellation tests timed out while the
host was saturated; it is not recorded as a green full run. The focused tests
then passed sequentially without timeout changes. Logs:
`/tmp/takeone-transform-{root-final,worker-full,convex-verified,web-build-verified,lint-verified,worker-build-final}.log`
and `/tmp/takeone-transform-{target-root-resume,root-resume,backend-resume}.log`.

Current Linux/AMD64 image `sha256:e5a687f73f6142878ecf845e9e77d46307df45eae63bd41dc8149dd294a108f1`
built from this source. The resumed full network-disabled smoke was **not accepted**:
it failed before reaching the new caption chain when the initial one-second input
returned `prepare failed: couldn't read that file (corrupt or unsupported)` from
the existing app ingest. At that time four unrelated containers consumed roughly
eight emulated CPU cores, including three unhealthy/restarting services. The
ephemeral failed container was removed, so its input could not be inspected and
host contention is not claimed as the proven root cause. Log:
`/tmp/takeone-transform-container-smoke.log`. Rerun the unchanged mounted smoke
on an idle Docker host before treating this image as deployment-ready.

Actual staged GCS archives, authenticated Studio edit-edit-removal, Telegram
reply editing, delivery, ten-way cloud capacity and latency remain pending. No
registry push, deployment, credit mutation or Telegram message
occurred.


## Multi-shot assembly local acceptance, 2026-09-21

The first multi-shot slice now creates free owner-scoped drafts from two to eight probed sources, saves immutable revisions, and admits the exact saved revision to the managed queue for one generation. The editor supports drag, keyboard and button reordering; millisecond trims; split, duplicate, remove and replace; crop/fit; mute; and cut, crossfade, fade and dip-to-black transitions. Pending operations freeze controls, account/project changes fence late responses, reactive query echoes cannot overwrite local work, and retained revision sources use an exact owner/revision-scoped metadata projection. No production deployment occurred.

Fresh unchanged-source verification passed **651/651 root tests across 53 files** and **407/407 backend tests across 62 files**, with two explicit provider tests skipped. Frontend and backend production builds, both typechecks and lint passed; lint reported 11 existing warnings and zero errors. Terraform tests could not run because the `terraform` executable is absent. The complete container smoke could not run because the Docker daemon is not available. These are unresolved release gates rather than passes.

A real local render used the production `renderAssembly` path with two distinct audio sources and a 500 ms crossfade. It completed in **635.66 ms** and produced a **3.500 s, 1920×1080, H.264/yuv420p 30 fps, AAC 48 kHz stereo** MP4. Full video/audio decode with strict FFmpeg error handling exited zero. SHA-256: `de95788b782014c71f8d6fef3ea67a194b57f2de6ab01824e585bab4c90d1c94`.

The local browser acceptance harness imported the real `AssemblyStudio`, displayed that real output, and exercised trim, reorder, free save to revision 2 and exact saved-revision export. The controls visibly froze while saving/exporting and the local receipt referenced `demo-revision-2`. Clerk and Convex transport were substituted, so this is local UI/renderer acceptance rather than authenticated staging acceptance. A safe owner-scoped project preview URL and expired-URL recovery remain pending in product code. Matching Convex/worker/frontend staging deployment, private signed-media playback, queue/refund behavior, ten-account concurrency and an authenticated recording remain required before release.

## Project timeline foundation, local verification, 2026-09-21

The current slice persists an owner-scoped editable-project draft for one completed job. The initial revision contains one source clip and uses the browser-reported duration rounded to milliseconds. Creating the draft is explicit and free: loading Studio does not create a project, and the returned revision is presented as `Saved draft · no generation used`.

Fresh sequential verification at `9928643` passed: root `npm test` **585/585 tests across 51 files** in **8.85s** (**9.31s wall**); `npm run typecheck:convex` in **1.08s wall**; `npm run build` in **2.71s wall**; and `npm run lint` in **0.19s wall** with **11 warnings and zero errors**. The root test run also emitted **27 Node ExperimentalWarning notices** that `localStorage` was unavailable without `--localstorage-file`; they did not fail the run. Backend `npm test` passed **361 tests with 2 skipped across 57 files** in **27.89s** (**28.21s wall**); `npm run build` passed in **0.93s wall**; and the repository's backend `npm run typecheck` passed in **0.67s wall**.

Local browser acceptance used the real Studio page and components with substituted Clerk/Convex boundaries at ignored `.superpowers/project-timeline-preview/`, served by `npm exec vite -- --config .superpowers/project-timeline-preview/vite.config.ts` on port 4324. The actual `backend/fixtures/sample.mp4` reached media `readyState` 4 with a 10-second metadata duration. The `Create editable project` control was visible and enabled, and pre-click instrumentation contained no mutation. One click issued exactly one `projects:createFromJob` mutation with `sourceJobId: "job_fixture"`, `durationMs: 10000` and UUID request ID `eb861151-0100-48c9-a4eb-b3c13b3cf376`. The resulting DOM showed `Revision 1`, `10s total · 1 clip` and `Saved draft · no generation used`; no generation or edit mutation ran. Browser `performance.now()` instrumentation measured **37.2ms** from click to visible card, including a deliberately substituted **35.8ms** mutation round trip. This is local substitution latency, not hosted or cloud latency.

This foundation persists only the owner-scoped draft timeline. It does not yet render multi-clip documents, generate scenes, run Jev, establish hosted/cloud latency, or validate the exact source EOF; the render path must probe that boundary. No deployment, push, external message or production mutation occurred.

## Admission and readiness follow-up, 2026-09-22

New render admission now uses one capability check after exact-request deduplication. AI retries retrieve the existing receipt after provider disablement or maintenance pause, without another reservation. Invalid AI modes/aspects/captions remain rejected. Paused Telegram submissions now produce a durable unavailable reply and commit update deduplication, preventing a rejected update from silently submitting after unpause.

The readiness query uses a status/reservation index to find legacy active jobs directly. A regression with 102 managed jobs before each legacy job reproduced the previous false zero; the indexed query finds all three. Results remain aggregate-only, bounded and explicitly truncated above 100 legacy jobs. This is configuration/migration evidence, not proof of live provider readiness.

Verification: 697 root tests passed, including three regressions observed failing before their fixes. Runtime npm audits reported zero findings for both root and backend packages. Live GCP, provider and Telegram acceptance remain pending; rendering and checkout stay disabled.

## Strict worker claims, 2026-09-22

A missing or NaN dispatch expiry passed the old negative expiry comparison, and malformed attempt numbers could enter a processing lease. Claims now require a finite future expiry and positive safe-integer attempt number. Invalid records return no claim and remain untouched for operator inspection. Six regression cases failed before the fix and passed afterward. Final full root suite: 703 tests passed, plus Convex typecheck/build/lint. The initial full run had all assertions pass but a Vitest console-RPC teardown error; the unchanged rerun exited cleanly. This does not migrate legacy jobs or prove live worker execution.
