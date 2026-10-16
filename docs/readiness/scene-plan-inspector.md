# Saved scene-plan inspection

The production stock planner writes a bounded, versioned plan before fetching
footage. The worker awaits `scenePlans:save` with its exact job and active lease.
A failed or uncertain write stops the render; an identical retry is accepted.
A different plan cannot replace an existing plan within the same attempt.

Each plan contains 1 to 12 scenes with purpose, search terms, shot type, motion and
contiguous output timing within 300 seconds. The projection follows the scene
encoder's 30 fps boundaries and the actual ordered trim/clip/speed operations.
These are planned shot boundaries, not frame-accurate footage annotations.
The worker does not save the creative brief, raw model response, narration,
provider URLs, private paths or selected asset metadata here.

`scenePlans:get({ jobId, accountKey })` requires authentication and matching owner
and account. It returns null for an unavailable owned identity/job and
`{state: 'unavailable', scenes: []}` when an owned job has no saved plan. Existing
videos, edits, AI renders and explicit offline generation do not invent plans.
A saved result includes `attempt`, `durationSec` and the safe scene fields. Its
state is one of `rendering`, `completed`, `failed`, `cancelled`, or
`previous_attempt`. Only `completed` permits the separate Studio client to seek
its matching playable video. Completed means the job's output key, current lease
and attempt all match the saved plan. A queued retry retains its previous plan
with an explicit previous-attempt state; the next successful claim clears it.

The existing job queries omit the new internal plan and fencing fields. Clients
must use the dedicated projection. No plan is copied onto an edit version,
because that version may have different timing or footage.

Deploy matching Convex schema/functions and worker before enabling the Studio
consumer. No migration is needed. This slice does not implement deterministic
asset retries, attribution, thumbnails, replacement, removal or scene editing.
Those require a retained asset composition. Provider rights, quality and real
cloud/browser acceptance remain separate release gates.

## Validation

Targeted Convex tests cover owner/account isolation, malformed IDs, safe legacy
projections, strict timing/text bounds, lease expiry, stale updates, immutable
writes with reordered JSON keys, retries/reset and exact output matching.
Worker tests cover awaited propagation through executor/prepare, persistence
failure/cancellation before footage, and encoder-grid/fractional trim/speed
projection. The Convex test also accepts an actual worker timing projection.
