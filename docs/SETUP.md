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

Each account gets three free videos (`FREE_LIMIT` in `convex/config.ts`). The credit packs are defined in the same file, and their Dodo product IDs come from the `DODO_PRODUCT_*` Convex variables. Checkout stays off until `DODO_CHECKOUT_ENABLED=true`. A failed job refunds its original allowance. The old unsigned payment webhook returns 503.

Prompt videos combine stock footage and narration. Managed script generation requires `LLM_API_KEY` and an explicit `LLM_MODEL`, and production never falls back to template scripts. Configure working voice, transcription and stock providers as described in `backend/.env.example`, then check them in staging.

The optional Veo scene adapter stays off until permissions, quota, cost and a real output are accepted. Web edits can start from an uploaded source or a finished video. Telegram accepts video uploads once the account is linked. Connection tasks and open release requirements are in [the connections checklist](readiness/OWNER-CONNECTIONS.md) and [release acceptance](readiness/RELEASE-ACCEPTANCE.md).
