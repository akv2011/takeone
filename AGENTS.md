# AGENTS.md

A guide for coding agents working in this repo. Read it before changing code.

## What TakeOne is

TakeOne turns a topic prompt, an uploaded video or a YouTube link into a captioned short MP4, 9:16 by default, then lets the creator edit it in Studio. Every edit is a new version with parent and root job IDs. The web app and an optional Telegram bot share one Convex queue, one allowance and one job history.

## Repo layout

- Root: the React 19 and Vite web app. Pages are in `src/pages/`, Studio controls in `src/components/`, and Vitest tests for the UI and Convex functions in `tests/`. `scripts/` holds the SEO prerender and checks, the container smoke test, the deployment preflight and the latency summarizer.
- `convex/`: schema and server functions. `jobs.ts` owns admission, leases, retries and refunds. `generate.ts` is the job API for the web app and the worker. `capabilities.ts` builds the snapshot the UI reads to hide unconfigured features. `http.ts` hosts the Telegram and Dodo webhooks.
- `backend/`: the worker and dispatcher, in Node and TypeScript. `src/managed/server.ts` is the Cloud Run dispatcher service, `src/managed/run.ts` the one-shot Cloud Run Job worker. `src/media/` holds the FFmpeg operations, `src/ingest/` the yt-dlp and ffprobe code, `src/content/` script generation. `src/cli.ts` is a local CLI for media experiments, not a production path.
- `infra/`: Terraform for the dispatcher, the job, the private bucket, service accounts and the optional Veo grant. Mocked plan tests live in `infra/tests/`.
- `docs/`: setup notes, readiness evidence, and dated specs and plans in `docs/superpowers/`.

## Build and test

```bash
npm ci
npm run build
npm run typecheck:convex
npm run lint
npm test

cd backend
npm ci
npm run typecheck
npm run build
npm test

terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
terraform -chdir=infra test
```

Backend media tests start real FFmpeg, so they need FFmpeg, yt-dlp and espeak-ng (or macOS `say`). Both Vitest configs cap file workers at two. A timeout under heavy host load is not a product failure, so rerun the file alone before you debug it. CI also builds `backend/Dockerfile` and runs `scripts/container-smoke.sh` inside it with networking disabled.

## Safety rules

- Never put user text in a shell string. Start FFmpeg, ffprobe and yt-dlp with `spawn(cmd, args[])` and no shell. Text that ends up in a filter graph is either written to a subtitle file or stripped of filter metacharacters first, as `drawtext` does in `backend/src/media/index.ts`.
- ffprobe and the main source paths (`inp()` in `backend/src/media/index.ts`, delivery, assembly, music) read with `-protocol_whitelist file`, so a crafted source cannot make FFmpeg fetch URLs. Use the same flag in any new call that reads a file a user or provider supplied.
- Keep jobs capped. Convex admits at most 10 active jobs, one per account. Workers hold a 90-second lease and Convex retries a lost job up to 3 times before one refund. Sources are limited to 50 MiB and 300 seconds, and downloads stream through `boundedDownload`. Cloud Run Job retries stay at zero because Convex owns retries.
- Keep storage private. The bucket enforces public access prevention. Clients get signed URLs from the dispatcher (15 minutes for the app, 2 minutes for review links), and clients never choose storage keys.
- Providers fail closed. A missing key, failed model call, malformed script, missing stock footage or failed caption step fails the attempt, which then follows the normal retry and refund path. Offline placeholders run only in explicit tests and local paths. A passing offline fixture does not prove a provider works.
- Treat creator text as data inside model prompts. Validate every model response against a strict shape before you use it.
- Make retries idempotent. Every request carries a request ID, and a retry with changed content is rejected before any debit.
- Never commit secrets. Runtime secrets live in Secret Manager and Convex environment variables. The worker authenticates with `WORKER_SECRET` and Application Default Credentials, never a Convex deploy key or a service-account JSON file.

## Conventions

- Convex functions use the generic builders and `declare const process` for environment typing.
- Vite bakes `VITE_*` variables in at build time, so redeploy the frontend after you change them.
- A schema field that the worker reads ships in one release with the matching Convex functions, worker image and frontend.
- Feature flags (`STOCK_VIDEO_ENABLED`, `YOUTUBE_INGEST_ENABLED`, `MUSIC_CATALOG_ENABLED`, `AI_VIDEO_ENABLED`, the Telegram and Dodo settings) stay off until a real staging run passes. `MANAGED_RENDERING_PAUSED=true` stops new admissions without charging anyone.
- Local validation never deploys. Deploys, webhook registration and Terraform applies are separate, explicit steps.

## Readiness evidence

- `docs/readiness/RELEASE-ACCEPTANCE.md` is the dated log of local, container and live-provider checks, with the gates still open.
- `docs/readiness/OWNER-CONNECTIONS.md` lists the accounts and credentials a deployment needs.
- `docs/readiness/benchmarks/` holds the local ten-job concurrency benchmark. `docs/readiness/caption-review/` holds caption frames in three aspect ratios. `review-links.md` and `scene-plan-inspector.md` record those two features' checks.
- `infra/README.md` covers provisioning, migration, operator health checks and post-deploy acceptance tests.

When you add evidence, record the date, environment, input, result and where the artifact lives. Mark mocked or synthetic runs as such.
