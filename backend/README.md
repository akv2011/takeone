# TakeOne backend

A TypeScript and ffmpeg pipeline that generates a video from a topic, edits an existing video, or clips a YouTube segment. Production uses a Cloud Run dispatcher service that queues each render on Cloud Tasks for a warm Cloud Run worker service. Convex owns the durable queue, reservations, and lease reconciliation.

## Managed runtime

`src/managed/server.ts` accepts authenticated dispatch requests and signs private output URLs. `src/managed/workerService.ts` is the warm worker. Each `POST /run` from the queue runs one render or upload probe. A render claims exactly one job, renews its lease, renders one MP4, uploads it, and records fenced completion. `src/managed/run.ts` does the same single run as a one-shot Cloud Run Job, which production keeps for rollback. Telegram and the web app use the same durable queue. Telegram webhook handling lives in the root Convex application.

Build with `backend/` as the Docker context. The default image command is `node dist/managed/server.js`. The worker service overrides it to `node dist/managed/workerService.js` and the rollback job to `node dist/managed/run.js`. No resident VM, long-poll bot, deploy key, or shell-based cloud storage client is needed.

Terraform `render_dispatch` picks the render path. Production sets `tasks` in `infra/prod.tfvars`, and `jobs` switches back to the Cloud Run Job. With the warm worker an upload is ready in about 3 s instead of 1 to 2 minutes, and a full clip takes 115 s at best and 145 s at the median. See [render dispatch](docs/DEPLOY-GCP.md#render-dispatch) for the rollback and the checks to run after a deploy.

See [managed runtime configuration](docs/DEPLOY-GCP.md) and [generation lifecycle](docs/WEB-GENERATION.md). Deployment and billing setup are separate operations.

Managed topic generation needs Gemini on Vertex AI (`GEMINI_PROJECT` and an explicit `GEMINI_MODEL`), Text-to-Speech Chirp 3 HD narration (`TTS_VOICE`, `TTS_LANGUAGE`), Speech-to-Text Chirp 3 captions (`SPEECH_LOCATION`, `SPEECH_MODEL`, `GCS_BUCKET`) and a stock footage provider. The worker reaches Google with its service account through ADC, never an API key. It rejects missing configuration, failed model calls and malformed angles or scripts instead of using offline templates. Script requests abort when a worker lease is lost. These checks do not establish quota, factual accuracy or creative quality, so validate real outputs in staging.

## Local development

Use Node 22.12+ on the Node 22 line (or a supported version listed in `package.json`), ffmpeg, and yt-dlp for YouTube ingest. Offline voice generation uses macOS `say` or Linux `espeak-ng`. Provider configuration is documented in `.env.example`.

YouTube extraction success does not guarantee media download access. Current
YouTube GVS requests may require per-video proof-of-origin tokens; without a
working token provider, `yt-dlp` can enumerate formats and still receive HTTP
403 during section download. Follow the current
[yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
and validate the selected provider on the actual Cloud Run egress path. Only
process sources the user owns or has permission to use.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run takeone -- "why UPI beat credit cards in india"
npm run takeone -- "make it vertical with a watermark" fixtures/sample.mp4
npm run takeone -- "clip https://youtu.be/aqz-KE-bpKQ 0:02 to 0:06"
```

The CLI exercises the local pipeline and retains its local quota behavior. Managed jobs inject an adapter because Convex already reserved their quota; the reservation's `isPro` still determines the watermark.

The test suite includes real ffmpeg generation/edit checks and dependency-injected worker, dispatch, fencing, concurrency, source size-limit, cleanup, mode/aspect, entitlement, and narration-duration tests. Paid provider calls and live cloud deployment are not required for these checks. The invalid-video ingest test may contact YouTube when yt-dlp is installed.

The scoped `gaxios@6.7.1` → `uuid@11.1.1` override patches the UUID dependency inherited from Google Storage. That client uses the compatible CommonJS v4 API; `storage-client.test.ts` exercises its real HTTP multipart upload path against a local server. Reevaluate the override when the Storage SDK upgrades its HTTP dependency. Keep Vite and Vitest compatible when updating the test toolchain, and rerun both media tests and the production container smoke check after dependency changes.

## Modules

- `managed/`: HTTP dispatcher, warm worker service, one-shot rollback job, bounded source downloads, and temporary-file lifecycle.
- `router/` and `gateway/`: validated operation plans and platform-independent request handling.
- `queue/`: one-job executor, timeout/abort propagation, and intermediate-file cleanup.
- `ingest/`, `media/`, `content/`, `transcribe/`, `search/`: source acquisition and rendering pipeline.
- `gemini.ts` and `google/`: Gemini on Vertex AI plus REST clients for Speech-to-Text, Text-to-Speech, Cloud Translation and Gemini cover images, all on one ADC token. Nothing in the app calls translation or cover images yet.
- `data/`: legacy local CLI quota adapter; production account/billing state belongs to root Convex.

MIT; see [LICENSE](LICENSE).
