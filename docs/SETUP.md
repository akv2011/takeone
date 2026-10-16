# Local development and managed hosting

TakeOne needs no VM or long-running process. Production is a static web build, Convex, a Cloud Run dispatcher, Cloud Run Jobs and a private GCS bucket. See [managed hosting](../infra/README.md) for provisioning, migration and acceptance tests.

## Local checks

```sh
npm ci
npm run build
npm run typecheck:convex
npm test
cd backend
npm ci
npm run typecheck
npm run build
npm test
```

Backend media tests need FFmpeg, yt-dlp and either macOS `say` or Linux `espeak-ng`. They do not need paid provider keys. The backend CLI stays available for local media experiments; it is not a production gateway.

Copy `backend/.env.example` for the worker settings and point local work at a development Convex deployment. Never give a worker a Convex deploy key. Cloud identities get only job execution, private-object access and the secrets they need.

## Product configuration

Each account gets five free videos (`FREE_LIMIT` in `convex/config.ts`). The credit packs are defined in the same file, and their Dodo product IDs come from the `DODO_PRODUCT_*` Convex variables. Checkout stays off until `DODO_CHECKOUT_ENABLED=true`. A failed job refunds its original allowance. The old unsigned payment webhook returns 503.

Prompt videos combine stock footage and narration. The managed worker needs Gemini on Vertex AI (`GEMINI_PROJECT` and an explicit `GEMINI_MODEL`, for example `gemini-3.8-flash`), Speech-to-Text Chirp 3 for captions (`SPEECH_LOCATION`, `SPEECH_MODEL`, `GCS_BUCKET`) and Text-to-Speech Chirp 3 HD for narration (`TTS_VOICE`, `TTS_LANGUAGE`). It reaches Google with its service account through ADC, never an API key. Production never falls back to template scripts or system speech. Configure a stock footage provider as described in `backend/.env.example`, then check every provider in staging.

Terraform enables the Speech-to-Text, Text-to-Speech and Cloud Translation APIs and grants the worker `roles/speech.client` and `roles/cloudtranslate.user`. Set `speech_location`, `speech_model`, `tts_voice` and `tts_language`, which have no defaults, along with `gemini_model`. `gemini_location` and `image_location` default to `global`, and `image_model` stays null to leave cover images off. The bucket deletes `sources/` and `speech/` objects after one day.

Cloud Translation and Gemini cover images are backend modules that nothing in the app calls yet. The worker copies render progress to Firestore when `FIRESTORE_PROJECT` is set, best effort, and nothing reads that copy yet, so Convex stays the source of truth. `firebase.json` holds the Firebase Hosting routing for the static build. An uploaded video can get a Gemini-picked moment once Convex sends a `clip` job for it with no time range. The worker side is done, and the app does not send that job yet.

The optional Veo scene adapter stays off until permissions, quota, cost and a real output are accepted. Web edits can start from an uploaded source or a finished video. Telegram accepts video uploads once the account is linked. Connection tasks and open release requirements are in [the connections checklist](readiness/OWNER-CONNECTIONS.md) and [release acceptance](readiness/RELEASE-ACCEPTANCE.md).
