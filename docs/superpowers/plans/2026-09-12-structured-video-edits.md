# Structured video edits implementation plan

> For agentic workers: execute this subsystem inline with the writing-plans, test-writing, verification-before-completion and self-review skills. The user authorized implementation and a separate ready PR.

**Goal:** Apply bounded trim, speed, aspect and fit/crop controls without parsing instruction text.

**Architecture:** Convex validates and normalizes an optional transforms object before enqueue, includes it in request identity, and passes it in the worker claim. The worker builds fixed operations for both ordinary uploads and retained caption archives. Existing ownership, music, billing, cancellation and completion fencing remain in use.

**Tech stack:** Convex, TypeScript, Vitest, FFmpeg.

## Contract

`generate:requestEdit` and `uploads:requestEdit` accept `transforms: { trim?: { start: number, end: number }, speed?: 0.5 | 1 | 1.5 | 2, aspect?: '9:16' | '1:1' | '16:9', fit?: 'fit' | 'crop' }`. Instruction is optional when transforms is provided; nonempty instruction and transforms together reject. Trim is in seconds with at most millisecond precision and `0 <= start < end <= 300`. Speed defaults to 1, aspect to the source/existing argument, fit to crop. Worker verifies the trim against probed duration and the final duration limit before rendering.

## Files and steps

- [x] Add tests/structuredEdits.test.ts for invalid inputs before debit, ownership, normalized replay, changed-content conflict, archive ancestry and worker claim.
- [x] Run `npm test -- tests/structuredEdits.test.ts` and confirm failure before implementation. Both new tests failed against the old mutation contract.
- [x] Add convex/transforms.ts validator and canonical normalization. Update convex/generate.ts, convex/uploads.ts, convex/schema.ts and convex/jobs.ts to store/claim/fingerprint transforms.
- [x] Add backend/src/media/structuredEdit.ts with fixed trim/speed/format operations and real-duration validation. Add direct gateway JobSpec construction, propagate claim through pipeline/run, and reuse it in captionTransform.ts.
- [x] Add backend structured-edit tests for parser bypass, crop/fit and real FFmpeg trim/speed/full decode, plus archive retiming and rejected out-of-range input.
- [x] Run root and backend tests, both builds, Convex typecheck and lint. Inspect the complete diff for ownership, charging, cancellation and archive regressions.
- [x] Update AGENTS.md with local evidence and acceptance limitations, commit, push and open a ready PR against main after confirming the parent migration was merged externally. Inspect remote checks and fix change-related failures. Do not deploy or merge.

## Verification evidence

CI run 34689554360 passed on implementation commit 7e3633e: 307 root tests, 267 backend tests, builds/typechecks, lint with nine warnings and no errors, ten Terraform tests and production container smoke. Six structured real-media tests took 16.5 seconds on Linux. Local typechecks/build passed; several local tests hit timing limits with host load above 210. PR #3 is ready for review. No cloud acceptance or production deployment is claimed.
