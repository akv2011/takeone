# TakeOne

TakeOne makes short vertical videos for creators. Type a topic and it writes a script, records narration, cuts stock footage to the voice and burns in timed captions. Upload a video you own and it edits that instead. Paste a YouTube link to a long video you have rights to and it picks one moment of up to 30 seconds, or cuts the exact range you name. Each job returns one captioned MP4, 9:16 by default, that opens in Studio for further edits. Every edit saves a new version, so the earlier cut is never lost.

## Features

- Three ways in: a text prompt (stock footage plus narration), an uploaded video, or a YouTube link with or without timestamps.
- Captions in clean, bold pop or short-phrase pop-in styles, three bundled fonts, top, middle or bottom placement, and cue-by-cue wording fixes that keep the original timing. Captions can be restyled or removed later without transcribing again.
- Studio edits: millisecond trim, speed up to 3x, 9:16, 1:1 or 16:9 with fit or crop, frame previews, transcript search with click-to-seek, and a crop that follows a single speaker.
- Soundtracks from an approved catalog or your own MP3, WAV or M4A, mixed with ducking and fades, or replacing the original audio.
- Brand kits that save fonts, caption colors and a PNG logo, applied to new renders.
- Three opening titles you write over the same video, previewed free and rendered as three versions.
- Scene plans for prompt videos, with the option to swap one scene for your own footage.
- A multi-shot timeline that trims, orders and crossfades finished videos and uploads into one export.
- Review links that expire after one or seven days, where guests leave timestamped notes without an account.
- An optional Telegram bot that accepts the same requests and sends the finished MP4 back to chat.
- An optional Veo adapter for AI-generated scenes, off by default.

The app reads a server-owned capability snapshot and hides any action whose provider is not configured, so an unconfigured stock provider, YouTube downloader, Telegram bot, music catalog, AI model or checkout never shows up as a working button.

## Stack

- Web app: React 19, Vite and Tailwind in the repo root. `npm run build` writes a static site to `dist/` and prerenders the public pages.
- Accounts, jobs and state: [Convex](https://www.convex.dev) in `convex/`. It holds users, allowances, the job queue, leases and retries, projects, review links and upload metadata.
- Auth: Clerk, verified by Convex through a JWT template.
- Rendering: a Cloud Run dispatcher service starts one Cloud Run Job execution per admitted job. The worker in `backend/` renders with FFmpeg and exits.
- Storage: a private GCS bucket with public access prevention enforced. The app shows videos through short-lived signed URLs.
- Infrastructure: Terraform in `infra/`, with a manual `Deploy GCP` GitHub Actions workflow.
- Google Cloud access: the worker calls every Google API with its own service account through ADC. There are no Google API keys, and a missing required setting fails the job.
- Scripts, scene plans, moment picking and subject crops: Gemini on Vertex AI, set by `GEMINI_PROJECT`, `GEMINI_LOCATION` and `GEMINI_MODEL` (for example `gemini-3.8-flash`). Gemini picks a YouTube moment from the video's transcript and a stored video's moment from the video file itself.
- Captions: Speech-to-Text v2 with Chirp 3, set by `SPEECH_LOCATION` and `SPEECH_MODEL`. Audio goes through a short-lived `speech/` object in the bucket. Non-Latin captions use the Noto fonts in the worker image.
- Narration: Cloud Text-to-Speech Chirp 3 HD voices, set by `TTS_VOICE` and `TTS_LANGUAGE`. Scripts over 5,000 UTF-8 bytes are split on sentence boundaries and joined with FFmpeg.
- Stock footage comes from Pexels or Pixabay, reaction stickers from GIPHY.
- Render progress mirror: the worker copies each render stage to Firestore `renders/{jobId}` when `FIRESTORE_PROJECT` is set. The copy is best effort and Convex stays the source of truth. The web app still reads progress from Convex.
- Hosting config: `firebase.json` serves `dist/` on the Firebase Hosting site `takeone`, rewrites `/create`, `/studio` and `/review` to `app.html`, and sends `no-store` and `noindex` headers on review links. `.firebaserc` holds a placeholder project ID, and no workflow deploys it yet.
- AI scenes: an optional Veo adapter on Vertex AI, enabled through the `veo` Terraform input and the `AI_VIDEO_ENABLED` Convex flag.

Two Google modules are in the backend without a caller in the app yet. Cloud Translation v3 (`backend/src/google/translate.ts`) translates caption cues and keeps their timing. Gemini cover images (`backend/src/google/coverImage.ts`, set by `IMAGE_MODEL` and `IMAGE_LOCATION`) draw a 9:16 PNG. The worker can also have Gemini pick a moment from an uploaded video. For a `clip` job on an upload with no time range, it first copies the file to `gs://$GCS_BUCKET/sources/<jobId>.mp4`. Convex and Studio do not send that job yet. The bucket deletes `sources/` and `speech/` objects after one day.

Convex admits at most ten running jobs at once and one per account. A worker holds a 90-second lease and Convex retries a lost job up to three times before it refunds the allowance. Sources are capped at 50 MiB and 300 seconds.

## Local development

Requirements: Node.js 22, FFmpeg, yt-dlp and espeak-ng.

```bash
npm ci
npm run dev

cd backend
npm ci
npm test
```

Copy `.env.example` to `.env.local` for the web app and `backend/.env.example` to `backend/.env` for the worker. Production rendering fails closed when required providers are missing. Offline fixtures are used only by explicit tests and local development paths.

## Validation

```bash
npm run build
npm run typecheck:convex
npm run lint
npm test

cd backend
npm run typecheck
npm run build
npm test

terraform -chdir=infra init -backend=false
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
terraform -chdir=infra test
```

CI runs all of the above, then builds the production container and runs a real FFmpeg render and decode inside it with networking disabled.

## Deployment

Read these in order:

1. [Connections to complete](docs/readiness/OWNER-CONNECTIONS.md)
2. [Release acceptance](docs/readiness/RELEASE-ACCEPTANCE.md)
3. [GCP infrastructure](infra/README.md)
4. [Worker runtime](backend/docs/DEPLOY-GCP.md)

The manual `Deploy GCP` workflow needs a repository environment named `production`, Workload Identity Federation, an explicit project ID, a digest-pinned worker image, a remote Terraform state bucket and existing Secret Manager secret IDs. It runs `plan` by default. `apply` also requires typing the exact project ID.

## Legal routes

The web app publishes `/privacy`, `/terms`, `/acceptable-use`, `/copyright` and `/refund-policy`. Keep product behavior, retention settings and provider configuration in line with those pages.

## License

MIT. See [backend/LICENSE](backend/LICENSE).
