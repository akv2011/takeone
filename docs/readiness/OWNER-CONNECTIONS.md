# Connections to complete

This is the list of accounts, credentials and settings a TakeOne deployment needs before each feature can go live. Finishing a connection does not mean the product passed end-to-end acceptance. See [release acceptance](RELEASE-ACCEPTANCE.md) for the evidence and open gaps.

## Pick the project first

Choose or create the GCP project before you run any deployment command. Terraform has no default project, and the manual GitHub Actions workflow asks for the exact project ID twice before an apply. Set your local CLI explicitly with `gcloud --configuration=takeone config set project YOUR_PROJECT_ID` rather than relying on whatever project your default configuration selects. Never copy the wrong project ID into repository variables, examples, frontend variables or Convex variables.

Use a Clerk production instance before inviting users. Clerk development keys carry strict usage limits and show a warning in the browser. Enable the sign-in methods you want, add the production domain and callback URLs, create the `convex` JWT template, set the issuer as `CLERK_JWT_ISSUER_DOMAIN` in Convex, set `VITE_CLERK_PUBLISHABLE_KEY` for the frontend build and redeploy it. Then test sign-up, sign-in, sign-out and a returning account.

### Connect the GCP project

1. Create or select a dedicated GCP project and attach billing. Record its project ID, not its display name.
2. Create a private GCS bucket for Terraform state in that project. Turn on object versioning and uniform bucket access.
3. Configure GitHub Workload Identity Federation for this repository and a deploy service account. Grant only the roles needed to manage the Terraform resources and read the named secrets.
4. Create a GitHub environment named `production`. Add variables `GCP_PROJECT_ID`, `GCP_REGION`, `TAKEONE_BACKEND_IMAGE`, `CONVEX_URL`, `DISPATCH_SECRET_ID` and `TERRAFORM_STATE_BUCKET`.
5. Add environment secrets `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT` and `TF_WORKER_SECRETS_JSON`. The JSON value maps worker environment names to existing Secret Manager secret IDs. It holds no secret values.
6. Run the `Deploy GCP` workflow with action `plan`. Check that every resource address uses the intended project and that nothing unrelated will be destroyed or replaced.
7. After you review the image, secrets, quotas and plan, run `apply` and type the exact project ID into `confirm_project`.
8. Set the dispatcher URL and matching authentication values in the Convex deployment. Keep `MANAGED_RENDERING_PAUSED=true` until any legacy-job audit is clean and one real staging render passes.
9. Turn on `STOCK_VIDEO_ENABLED`, `YOUTUBE_INGEST_ENABLED`, `MUSIC_CATALOG_ENABLED`, `AI_VIDEO_ENABLED`, Telegram and Dodo only after each one's real acceptance test passes. The website reads these flags and keeps each action unavailable until then.

The deployment runs on a static web host, Convex, Cloud Run Jobs and private GCS. Cloud Run runs the video containers and GCS stores source and output files. There is no Compute Engine VM to provision or maintain.

| Mark when ready | What to connect | Where it belongs | What we will test with it |
|---|---|---|---|
| [ ] | Target GCP project and billing | GitHub `production` environment and local CLI; confirm the exact project ID before provisioning | Deploy staging dispatcher, jobs and storage; run ten overlapping video jobs and queue an eleventh |
| [ ] | Production Clerk instance and matching Convex auth configuration | Clerk, production Convex and the frontend build | Sign-up, sign-in, sign-out, returning account, three free videos and owner-scoped data; no development-key warning in the browser |
| [ ] | Telegram bot token, webhook secret, matching bot username and app origin | Staging Convex `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` and `APP_URL`; token in worker Secret Manager for source downloads | Link an account, generate, edit, receive a playable video, retry delivery and confirm shared credits |
| [ ] | Two consenting Telegram test accounts | A browser session the tester can observe | Real messages and playable results, plus isolation between the two accounts |
| [ ] | Model, transcription and voice credentials, stock-provider keys and `GIPHY_API_KEY`, with quotas confirmed | Worker Secret Manager | Render real source and topic videos; inspect speech, captions, framing, music and failures |
| [ ] | A reviewed YouTube proof-of-origin token provider for creator-owned clips | Private staging service plus the matching `yt-dlp` plugin in the worker image | Explicit and automatic clips download from the Cloud Run egress IP; provider failure and cancellation |
| [ ] | Veo project access, model availability and quota, if AI scenes are wanted | Worker configuration and scoped GCP identity | Real AI scene generation, cost and retry behavior; leave the capability off until accepted |
| [ ] | Dodo merchant verification, test API key, signing secret, business ID and three product IDs | Staging Convex environment | Hosted test checkout, signed delivery, credit grant, duplicate events, expiry and retry, refund recovery |
| [ ] | Music licensed for exported videos | Private GCS `music/` objects and Convex `MUSIC_CATALOG_JSON` | Preview, ducking, fades, replacement and listening to exported audio |

For Dodo, create one-time USD products matching the packs in `convex/config.ts`. Keep `DODO_CHECKOUT_ENABLED` and `DODO_RECONCILIATION_ENABLED` off until their staging gates pass. Never paste credentials or Telegram login codes into this checklist or commit them.

Settle the billing policy before checkout goes on. That means how partial and active disputes are treated, whether to hold a whole pack or proportional credits, and what is restored after a resolution. Confirm Dodo's dispute amount units in the merchant sandbox. Verified dispute recording exists. Automatic dispute deductions, restoration and an audited operator resolution are still code to write, not missing credentials.

## Evidence required before calling it ready

For each real run, record the environment, input, test identity, result, elapsed time and artifact. Play the exported video. Use at least two Telegram identities and ten distinct app accounts for the concurrency run. Record provider failures and queue wait, not only successful render time. Mocked cloud tests and synthetic local FFmpeg renders are separate evidence.

Deployment steps and migration safeguards are in [managed hosting](../../infra/README.md).

Creator-owned audio (MP3, WAV or M4A, up to 20 MB) uses Convex storage, so it needs no catalog objects in GCS. Test upload, preview, deletion, web generation and Telegram reuse against a matching staging Convex and Clerk pair. The approved music catalog still needs its GCS objects and catalog configuration. Upload listings and URL issuance are owner-scoped, but Convex storage URLs work as bearer links rather than expiring GCS signatures. Deleting a source revokes its URL. Upload transport caps and orphan cleanup are still acceptance gaps.

Abandoned Convex uploads have an internal paginated cleanup that defaults to audit-only. In staging, inspect `storageCleanup:status`, confirm the protected fixtures survive and review a full sweep before you set Convex `UPLOAD_CLEANUP_MODE=delete`. `off` pauses scanning. No local test turns on production deletion. This covers Convex orphan blobs only. GCS failed-attempt artifacts and upload transport limits are separate work.

## YouTube downloads

On 2026-09-12 a live explicit-range clip got through `yt-dlp` extraction, but both the video and audio section downloads returned HTTP 403 from Google Video servers. Current yt-dlp guidance says YouTube enforces proof-of-origin tokens and recommends an automatic provider plugin. Treat that provider as a separately reviewed private staging dependency, and never expose its unauthenticated HTTP service publicly. Provider timing and test artifacts are in release acceptance. They are not cloud-load results.

## Payment review

Internal read-only investigation queues live in `convex/paymentReview.ts`. They need a matching staging deployment and operator CLI access. They do not resolve disputes or change credits. The credit-hold policy above is still open.

## Deployment preflight

The manual deployment workflow checks every required input before Google authentication. It requires a digest-pinned Artifact Registry image and a deploy service account in the selected project, a Convex HTTPS origin, a state bucket, a workload identity provider and a secret-ID mapping that includes `WORKER_SECRET`. It reports field names without printing values. Apply requires the exact project confirmation. This checks the shape of the configuration, not live IAM permissions, quotas or provider readiness.
