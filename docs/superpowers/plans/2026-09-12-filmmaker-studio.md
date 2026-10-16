# Filmmaker Studio implementation plan

> Execute inline in this isolated worktree. The parent task coordinates the separately authorized API work.

**Goal:** Arrange the existing Studio controls into a responsive editing workspace and keep an owned parent video playable during an edit.

**Architecture:** StudioWorkspace owns responsive layout and mobile panel selection. Studio retains its current mutations, playback hook and query lifecycle. PreviousVersionPlayer independently reads the parent through the existing authenticated query and signed video URL hook.

**Tech stack:** React, TypeScript, CSS, Convex, Vitest.

## Design

Reuse the existing Inter/display/monospace typography. Palette: canvas #181b20, canvas border #303640, warm panel #f3f3ef, paper #ffffff, ink #111111, focus #2563eb. The existing decoded filmstrip is the primary visual control. Desktop has versions left, video and timeline center, inspector right; mobile shows video and timeline first with Inspector/Versions panel buttons.

## Tasks

- [x] Create isolated codex/filmmaker-studio worktree from the migration branch.
- [x] Inspect existing Studio mutations, timeline and owner-scoped history.
- [x] Build StudioWorkspace slots without duplicating mounted editing controls.
- [x] Move current caption/music/conversational edits into Inspector, history into Project and timeline below canvas.
- [x] Add parent playback using getJob and useVideoUrl; failed/missing parent retains recovery navigation.
- [x] Test panel switching without discarding input, parent signing/auth restrictions and real status text.
- [x] Run UI/timeline regression tests, production build and lint; inspect the responsive browser layout.
- [x] Review diff for ownership/lifetime regressions, push ready PR against codex/managed-video-jobs and inspect CI.

## Scope boundaries

No invented scene cards, stage progress or queue position. The initial layout passed clean Linux CI with 311 root tests. The approved follow-up stacks this PR on the separately reviewed structured API and adds explicit transform submission. Local preview does not establish provider or staging acceptance.


## Structured integration follow-up

- [x] Import the reviewed API branch locally and retarget the workspace PR to it.
- [x] Add a frontend transform type, ratio and Fit/Crop controls with free canvas previews.
- [x] Submit timeline numeric values through transforms while keeping chat instructions separate.
- [x] Preserve source/request identity and the existing stale-view guard for every submission.
- [x] Reject over-300-second slowed exports locally; keep valid selections previewable.
- [x] Verify exact payload, fractional times, route reset and late-response regressions.
- [ ] Inspect a real local video in the full Studio fixture and rerun combined CI.


## Integration evidence

The combined UI passed 76 targeted tests using Vitest's thread pool. The local
production build passed; prior fork-pool attempts timed out before test workers
started. The full Studio browser fixture decoded eight real frames, displayed
loaded duration and playhead 3.875, played 1.125–3.875 at 1.5x and restored rate 1.
Preview made no mutation. Apply submitted exact numeric values without an
instruction, then the queued parent video played. Mobile had no document
overflow or page errors. Auth, Convex and signing were mocked; local media,
components and playback were real. `/tmp/takeone-studio-integration.json` and
`/tmp/takeone-studio-real-{desktop,pending,mobile}.png` hold the evidence.

Frame samples now form one horizontal scrolling filmstrip instead of the prior
two-row grid. This final layout adjustment retains the same frame buttons and
seek behavior; final browser and CI checks cover it before completion.

Review also fenced the entire Studio by Clerk account ID. An account switch now
unmounts the old view, invalidates in-flight responses and clears drafts. A delayed
structured-response regression verifies that the new account is not redirected.
The final frame-preview local run had three passes and one five-second timeout
under host load; final Linux CI is required rather than treating that run as green.
