# Filmmaker release sequence

The user approved parallel implementation with separate ready-for-review PRs on
2026-09-12. Managed platform migration PR #1 was externally merged as
`524291f76d817afa863b27bf6dd459db2d5fdb34`. The agents did not merge or deploy it.
Structured API PR #3 and scene planning target `main`. Studio PR #2 targets
`codex/structured-video-edits` so its review diff contains frontend integration,
not duplicate API changes. Merge the reviewed structured API before the Studio
integration; retarget Studio to main after that dependency lands. Scene planning
is independent. No GitHub merge or production deployment is part of validation.

| Branch | Scope | Required evidence |
| --- | --- | --- |
| `codex/structured-video-edits` | Validated trim, speed, ratio and fit/crop inputs through reservation and worker execution | Ownership and retry identity tests; actual FFmpeg transform and decode; backend and Convex checks |
| `codex/filmmaker-studio` | Responsive canvas, existing controls, timeline and version navigation | Component behavior tests; browser inspection where available; frontend build |
| `codex/creative-scene-planning` | Creative brief and timed stock searches for prompt generation | Schema, timing, cancellation and missing-footage tests; real media composition where possible |

Each agent writes its detailed subsystem plan in its isolated worktree before
implementation. The Studio layout was first checked independently, then the reviewed structured API was merged locally into the Studio branch. Numeric timeline and framing controls now submit transforms; conversational instructions remain available. Agents coordinate any shared backend
file changes before editing.

For each PR, review the implementation against the approved design, inspect its
diff for unrelated changes, run the relevant local checks, and inspect remote CI.
Test the combined changes before claiming they work together. Record failures and
missing external connections without treating mocked provider tests as live
acceptance.

Safe persisted stage progress, stored asset snapshots, scene replacement and
removal, and live staging acceptance remain subsequent slices of the approved
design. The current three branches do not by themselves complete those slices.

The latest base checks passed on GitHub Actions run `34688267019`, including the
network-disabled real-media container smoke. Actual YouTube downloads still
returned HTTP 403 in the last live check. Stock credentials, GCP reauthentication,
and an accessible Telegram test session remain necessary for their respective
live acceptance tests. Dodo and Veo remain gated as documented in the owner
connection checklist.


## Workspace browser evidence

The first layout fixture used actual StudioWorkspace CSS and controls at desktop
1440px and mobile 390px. All portrait, square and landscape boxes preserved their
ratios with no horizontal document overflow or page errors. Panel switching
retained typed values. Evidence: `/tmp/takeone-workspace-browser.json` and
`/tmp/takeone-studio-{width}-{ratio}.png`. This fixture did not verify authenticated
playback. A later full Studio fixture uses a real local MP4 with authentication,
queries and URL signing substituted at their boundaries; its acceptance is
recorded in the Studio subsystem plan. The real source yielded eight decoded
frames, exact 3.875-second preview endpoint and structured submission with no
preview debit. The queued parent stayed playable. This does not prove real
authentication, cloud signing or provider delivery.

The independent workspace commit passed all 311 web/Convex tests and its
container/infrastructure checks in GitHub run `34689535264`. The combined API/UI
commit requires a new full CI run. Local host saturation caused Vitest worker
startup timeouts; those runs are not counted as passing tests.
