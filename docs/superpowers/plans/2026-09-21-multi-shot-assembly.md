# Multi-shot Assembly Implementation Plan

> **For agentic workers:** implement sequentially with subagent-driven development, specification review, and code-quality review after every task.

**Goal:** let an owner create and save a two-or-more-shot draft, edit its order/trims/audio/fit/transitions locally, and explicitly export the exact saved revision through the existing managed queue.

**Release boundary:** the first slice accepts owned completed jobs and probed ready uploads, at most 12 clips and 8 unique sources, 300 seconds output, cuts/crossfades/fades/dip-black, per-clip fit/crop and preserve/mute audio. Text/graphics, detached audio, narration, music, editable caption reconstruction, AI planning, and generated scenes are rejected before billing in this slice.

## Task 1: Make transition timing renderable and bounded

**Files:** `convex/timelineValues.ts`, `tests/projects.test.ts`

- [x] Define transition overlap by the incoming boundary. A cut has zero overlap. Each other transition overlaps the adjacent clips by `durationMs`.
- [x] Require the first clip to start at zero and every later `timelineStartMs` to equal the previous clip end minus its boundary transition duration.
- [x] Require document duration to equal the final clip end, transition duration to be shorter than both adjacent clip spans, one transition per adjacent pair, and no overlapping incoming/outgoing transition windows within a clip.
- [x] Retain all existing ID, layer, geometry, source-time, and 300-second limits.
- [x] Add isolated boundary tests for cut continuity, conventional crossfade duration, missing transition overlap, excessive transition length, two transitions consuming an entire middle clip, and serialization stability.
- [x] Run focused timeline tests, Convex typecheck, lint, and diff check.

## Task 2: Add trusted source metadata, retention, and exact-revision export admission

**Files:** `convex/schema.ts`, `convex/projects.ts`, `convex/uploads.ts`, `convex/generate.ts`, `convex/jobs.ts`, `convex/storageCleanup.ts`, `convex/timelineValues.ts`, `tests/projects.test.ts`, `tests/uploads.test.ts`, `tests/jobs.test.ts`

- [x] Persist worker-probed `durationMs`, `width`, `height`, and `hasAudio` for completed jobs and ready video uploads. Uploads stay `preparing` until a bounded probe succeeds; browser metadata is never authoritative for multi-source bounds.
- [x] Add an indexed immutable revision-source relation for every job/upload referenced by a revision. Use it to block upload deletion and storage cleanup while any retained revision or active export references the asset.
- [x] Generalize projects so assemblies may have no legacy `sourceJobId`. Add owner-scoped `createAssembly`, `get`, and safe source-library/media projections. Require confirmed video rights and at least two ready/probed sources.
- [x] `createAssembly` makes a deterministic free draft in selected order and never enqueues. It returns one immutable revision using stable clip IDs and server metadata.
- [x] `saveRevision` validates exact source bounds from trusted metadata and writes the revision-source rows atomically.
- [x] Add `timelineExport` to `genJobs`: project ID, exact revision ID, normalized timeline snapshot, and closed export profile. Include all fields in request fingerprinting.
- [x] Add `projects:requestExport`. Revalidate ownership, exact revision, current source readiness/metadata, 2–12 clips, at most 8 unique sources, supported layer/audio scope, and output duration before calling existing `enqueue` exactly once.
- [x] `claimJob` resolves worker-only source descriptors: validated GCS keys for completed jobs and owner-scoped Convex URLs for uploads. Browser projections expose neither keys, storage IDs, provider data, nor bearer URLs outside the scoped preview action.
- [x] Tests cover auth, rights, metadata lifecycle, source bounds, retained deletion/cleanup, deterministic draft, stale save, exact retry/content conflict, unsupported feature rejection before debit, exact revision snapshot, one reservation, refund, and foreign/deleted source rejection.

## Task 3: Render exact assembly snapshots with real media

**Files:** `backend/src/managed/worker.ts`, `backend/src/managed/render.ts`, `backend/src/managed/run.ts`, create `backend/src/media/assembly.ts`, create `backend/src/media/assembly.test.ts`, and focused managed tests.

- [x] Add the closed assembly claim type and an early managed-renderer branch. Never pass browser URLs, storage keys, provider identifiers, or FFmpeg expressions through the timeline.
- [x] Download each unique source once with aggregate byte, source-count, clip-count, and deadline limits. Propagate job cancellation through downloads, probes, and encoding.
- [x] Probe every actual input and reject source ranges past EOF even if stored metadata drifted.
- [x] Normalize selected segments to the target aspect, even dimensions, square pixels, 30 fps, H.264-compatible video, 48 kHz stereo audio, and zero-based timestamps. Generate exact-length silence for missing or muted source audio.
- [x] Implement cut via concat and closed, hard-coded crossfade/fade/dip-black mappings via `xfade`/`acrossfade`. Apply free-tier branding and final delivery validation through existing helpers.
- [x] Real FFmpeg tests use at least two colored clips with distinct sine tones plus silent/muted and mixed-dimension cases. Assert sampled order/transition frames, output duration, audio windows, H.264/AAC streams, full decode, cancellation cleanup, invalid range rejection, and no completion/upload on failure.
- [x] Extend network-disabled container smoke before exposing export in the UI.

## Task 4: Ship the editable assembly workflow

**Files:** Dashboard, Studio, project routes/API refs, new source-library/editor/preview components and focused UI tests.

- [x] Add an explicit Dashboard `Assemble clips` flow with owner-ready/probed multi-select, rights confirmation, target length, aspect, and preserve/mute audio. Creating the draft is free and navigates to the project Studio route.
- [x] Add project routing and safe owner reads without breaking legacy `/studio/:jobId` navigation.
- [x] Build an `AssemblyEditor` using the shared timeline document. Support drag reorder plus keyboard buttons, numeric trim, split, duplicate, remove, replace, fit/crop, mute, and closed transition controls. Recalculate overlap-aware timing deterministically.
- [ ] Local preview uses scoped refreshable URLs and keeps editing usable if a decoder or URL refresh fails. Local edits never call save/export automatically. Deferred until the project API exposes a safe owner-scoped preview URL; the editor currently fails closed without source metadata.
- [x] `Save draft · free` performs optimistic `saveRevision`. `Export saved revision · 1 generation` is a separate action and cannot export dirty local state.
- [x] Update Studio billing copy so local edits and saves are free while explicit exports and existing flattened-video renders retain their correct cost labels.
- [ ] Browser tests cover accessibility, mobile panel persistence, reorder/trim/remove/transition, preview, dirty/save state, source/account fencing, expired URL recovery, exact export revision, and no debit during local editing. All listed behavior except scoped preview and expired-URL recovery is covered; those remain paired with the preview API work above.

## Task 5: Verify and document

- [ ] Run full root/backend tests, typechecks, builds, lint, Terraform tests, and the complete container smoke sequentially. Root/backend/build/typecheck/lint passed; Terraform is not installed and Docker daemon is unavailable, so those two checks remain open.
- [x] Run a real local two-source browser workflow and real FFmpeg export/decode; measure local interaction latency separately from encoding.
- [x] Record exact evidence and limitations in `docs/readiness/RELEASE-ACCEPTANCE.md` and `AGENTS.md`.
- [ ] Hosted acceptance remains gated on matching Convex/worker/frontend deployment, private media access, ten-account concurrency, refund behavior, and a real authenticated recording.
