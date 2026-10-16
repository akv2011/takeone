# Tests

TakeOne has four test layers. Run them all before you call a change done. The commands are in the [README](../README.md#validation).

## Web app and Convex

`npm test` in the repo root runs every `tests/**/*.test.{ts,tsx}` file with Vitest. Convex functions run against `convex-test`, and UI components render with Testing Library. These tests cover queue admission and leases, refunds, account isolation, webhook signatures and body limits, payments, uploads, review links and the Studio controls. Provider and cloud calls are mocked.

## Worker

`npm test` in `backend/` runs every `src/**/*.test.ts` file.

| Layer | Example files | What it proves |
|---|---|---|
| Unit | `router`, `captions`, `transcribe`, `content` | Pure logic with no I/O, such as prompt to job spec, subtitle builders and transcript parsing |
| Module | `media/*.test.ts`, `ingest/*.test.ts` | Each FFmpeg operation produces valid media, and bad input is rejected |
| Integration | `app.integration.test.ts`, `managed/*.test.ts` | The full route, queue, render and upload path, with leases, fencing and cleanup |
| Edge cases | `edge.test.ts` | Broken inputs, missing streams, injection attempts and load |

The edge suite uses the fixtures in `backend/fixtures/` (`edge_corrupt.mp4`, `edge_zero.mp4`, `edge_noaudio.mp4`, `edge_audioonly.m4a`, `edge_portrait.mp4`). It checks that:

- corrupt, zero-byte and missing files raise a clean `IngestError` instead of a raw crash;
- speed changes on a video with no audio still produce valid video, and converting it to MP3 raises a clear `MediaError`;
- reformatting an audio-only file fails with "no video to edit";
- a corrupt upload returns friendly text to the user, not a stack trace;
- a portrait source reformats to 9:16 without distortion;
- watermark text with injection characters cannot break the FFmpeg filter;
- 12 concurrent jobs across users never exceed the concurrency cap, and all of them finish.

Run one file with `npx vitest run src/edge.test.ts`, or watch mode with `npx vitest`.

## Infrastructure

`terraform -chdir=infra test` runs 12 mocked plans from `infra/tests/environment.tftest.hcl`. They check that Veo stays off unless opted in with a supported model, that environment overrides and plaintext secret collisions are rejected, and that bucket CORS accepts only exact HTTPS origins. They create no cloud resources.

## Production container

CI builds `backend/Dockerfile` and runs `scripts/container-smoke.sh` in it with `--network none`. The script renders every caption style and font, a three-shot assembly, branding, owned-audio mixing and caption restyling with real FFmpeg, checks frames and audio, and decodes each output fully. It then starts the packaged dispatcher and confirms that `/healthz` answers and that an unauthenticated `/dispatch` gets 401. A separate CI step checks `/healthz` again from outside the container.

## Known gaps

- Real caption text needs an FFmpeg build with libass. On a build without the `subtitles` filter, caption rendering degrades and the real-render tests skip on macOS. Linux CI requires libass.
- Tests that touch YouTube or paid providers are mocked or skipped. They do not prove download access, provider quota or output quality.
- Local runs do not establish cloud concurrency, latency or signed-URL behavior. Those gates are in [release acceptance](readiness/RELEASE-ACCEPTANCE.md).
