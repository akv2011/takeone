# Creative scene planning implementation plan

> **For agentic workers:** Execute inline in the authorized isolated worktree. No additional agents.

**Goal:** Generate a bounded creative brief and timed stock queries for production prompt videos.

**Architecture:** Reuse the configured cancellable content LLM transport. Validate a brief and 2–12 contiguous scenes against measured narration duration, then resolve and normalize each scene without looping or replacing missing footage. Leave persistence and scene UI to a later Convex slice.

**Tech Stack:** TypeScript, Vitest, FFmpeg, existing Pexels/Pixabay transport.

- [x] Export the existing LLM transport and add `content/scenes.ts`. Validate required brief fields, bounded arrays and strings, finite contiguous timing, query uniqueness, and prohibited query terms. Invalid JSON/provider output rejects without fallback.
- [x] Add `media/scenes.ts` to resolve all scenes before rendering; fail on missing, duplicate-byte, or too-short footage. Normalize scene duration, frame rate and canvas and concatenate without loop flags.
- [x] Route strict generation in `app.ts` through the planner and scene renderer after narration duration is known. Preserve offline behavior.
- [x] Test soap/founder model requests, malformed plan rejection, cancellation and stock resolution failures. Test production prepare integration, then run backend tests and build, review diff, commit and open ready PR.

## Acceptance boundaries

Mocked provider tests establish query propagation and validation, not visual relevance or licensing. The model chooses relevant queries but there is no visual semantic classifier. Plans and selected assets are local to one attempt; durable retry snapshots, attribution projection and replace/remove UI remain unimplemented. Missing live stock keys block real soap/founder export acceptance.

## Verification evidence

The production-routing regression failed against the old generator and passes with scene planning. The audio-tail regression uses a real MP4 with one second of video and four seconds of audio; it fails without encoded-duration validation and passes with it. Final local focused suite: 40 tests passed. A captured live soap plan exposed an overly strict per-phrase limit; validation now preserves complete queries up to 240 joined characters, and the prompt requests concise stock searches. Both captured soap plans and over-limit regressions are retained. The prompt explicitly shows an array; a single query string canonicalizes to one array entry before the same validation. Remote CI and real scene checks are tracked on PR #4; use its current commit status for final acceptance.
