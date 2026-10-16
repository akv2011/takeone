# Filmmaker workspace and scene-directed generation

## Purpose

TakeOne must support three clear starting paths in one product. A creator can
generate a narrated video from a prompt, clip a permitted YouTube source, or edit
an uploaded video. After a source exists, each path opens the same visual Studio.
The Studio must let a creator inspect the current cut, preview local changes and
understand a server render while it runs.

This phase turns the existing Studio controls into a coherent editing workspace.
It also defines how prompt generation selects business-specific footage. It does
not add a general multitrack desktop editor, arbitrary keyframes, collaboration,
or unlicensed web scraping.

## Product structure

The Dashboard keeps three explicit creation cards.

- Create from a prompt asks for the subject, audience, visual direction, duration
  and output ratio. Stock scenes remain the default production path. AI scenes
  appear only when the configured Veo capability has passed staging acceptance.
- Clip a video accepts a permitted YouTube URL, optional range and output ratio.
  It explains that current YouTube downloads require a working private
  proof-of-origin token provider. Uploading the owned source remains the reliable
  fallback.
- Edit a video accepts a saved source or new upload and opens Studio after the
  source metadata is ready.

Each submitted job uses the current reservation, ownership, idempotency and queue
rules. Selecting assets and previewing browser-local trim or speed changes costs
nothing. A server render uses one generation.

## Studio layout

Desktop Studio uses four stable regions.

```text
+----------------+------------------------------+----------------------+
| Project        |                              | Inspector            |
|                |        Video canvas          |                      |
| Scenes         |                              | Transform            |
| Assets         |       safe-area guides       | Crop and fit         |
| Versions       |                              | Speed and audio      |
|                |                              | Captions             |
+----------------+------------------------------+----------------------+
| Playback       | Timeline, playhead, selection, scene and cue lanes  |
+----------------+-----------------------------------------------------+
| Render activity and queued result                                   |
+----------------------------------------------------------------------+
```

On narrow screens, the video stays first. Scenes, Inspector and Versions become
labelled tabs. The timeline remains directly below the video and scrolls
horizontally. Every control retains a visible label, keyboard focus and native
input fallback.

The visual direction uses the existing TakeOne palette and type system. The
workspace itself uses a dark neutral editing surface so footage, crop guides and
caption safe areas remain legible. Warm panels retain the product identity around
the editor. The signature element is a filmstrip timeline whose selected frames
also drive the video playhead and crop preview.

## Timeline and transforms

The first release has one video lane, one caption cue lane and one soundtrack
lane. The video lane shows the existing eight browser-decoded samples across the
current duration. A playhead, draggable start handle and draggable end handle use
millisecond values. Numeric inputs remain available for exact entry.

The Inspector groups controls by what they change.

- Transform offers portrait, square and landscape ratios, plus Fit and Crop.
  Crop uses the current automatic subject focus when available. The canvas shows
  the intended output ratio before submission.
- Timing offers trim boundaries and 0.5, 1, 1.5 and 2 times speed. Browser preview
  seeks and changes playback rate without creating a job.
- Captions exposes existing style, font, placement and wording controls against
  retained timing archives.
- Audio exposes approved or creator-owned music, mix level, ducking and source
  replacement with the current warning.

The first release does not show draggable scene rearrangement because the worker
does not yet persist a scene composition. It presents generated scene cards as a
read-only plan with Replace and Remove actions. Those actions produce a revised
server plan and require a render only when the creator applies the revision.

## Scene-directed prompt generation

Prompt generation produces a structured creative brief before media selection.
The brief contains the audience, promise, visual nouns, setting, lighting, camera
motion, pacing and restricted terms. The scene planner converts the brief and
narration into bounded scene requests. Each request has a time range, purpose,
search terms, shot type and motion description.

For a natural beauty soap, the planner can request product macro, foam texture,
botanical ingredients, hands using the product and a clean bathroom setting. For
a founder video, it can request late-night laptop work, a whiteboard, a small team
decision, a product screen and a launch moment. The examples guide the planner;
they do not hard-code an industry template.

The asset resolver searches only configured providers whose terms allow exported
commercial videos. Pexels and Pixabay remain the initial stock sources. GIPHY is
limited to optional reaction stickers. Search results must pass the existing byte,
duration, media and cancellation checks. The resolver records provider,
attribution, query and selected asset identity in the job snapshot so retries do
not silently choose different footage.

When no acceptable stock asset exists, strict production generation fails and
uses the existing retry and refund path. It does not use a gradient, unrelated
clip or repeated source shot. AI generation can fill a scene only when the user
selected AI scenes and the capability is enabled. Provider footage is never
presented as footage found from the unrestricted web.

## Render activity

Queued and running jobs show useful state in place of the static loader. The UI
maps existing safe worker stages to user language.

- Waiting for a render slot
- Writing the script
- Recording narration
- Finding permitted footage
- Building the cut
- Adding captions and sound
- Checking the final video
- Saving the video

The activity panel shows completed stages, the active stage, elapsed time and the
current queue position when Convex can derive it without scanning the queue. It
also shows the planned scene cards once they exist. It never exposes storage
paths, prompts sent to providers, credentials or raw provider errors.

The previous completed version stays playable while an edit renders. The pending
version appears beside it with its requested changes. A failure leaves the prior
version intact, states whether the generation was restored and offers a retry
only through the existing idempotent request flow.

## Data and API boundaries

Add a versioned render-plan projection to a job. The stored internal plan may
contain provider identifiers needed for deterministic retries. The browser query
returns only scene timing, purpose, approved thumbnail URL, attribution and a
plain status. Thumbnail signing follows the same owner checks as video and music
URLs.

Add safe stage progress to the existing job record or a bounded child table. Each
update must match the active job and lease token. Stage order only moves forward
for one attempt. A retry starts a new attempt without rewriting earlier evidence.
Public queries return the current attempt and aggregate timing only.

Transform controls submit structured values instead of relying on free-form text.
The server validates trim, speed, ratio, fit or crop mode, caption options and
music settings. It includes them in the request fingerprint before reserving a
generation. The existing instruction router remains available for conversational
edits, but standard controls do not depend on its wording parser.

## YouTube clipping boundary

Remove no further validation from YouTube ingest. The worker still checks exact
YouTube hostnames, ownership confirmation, duration, bytes, streams, cancellation
and final decode. A private proof-of-origin token provider and matching yt-dlp
plugin become explicit staging dependencies. Operators must keep the provider off
the public internet and verify it from the same Cloud Run egress path.

If YouTube returns an access or token error, the UI says the source could not be
downloaded and asks the user to upload the video they own. It does not describe
the binary as missing, spend a successful generation, or keep retrying beyond the
managed attempt policy.

## Test and acceptance plan

Component tests cover desktop regions, mobile tabs, keyboard controls, local
playhead synchronization, crop and ratio previews, scene actions, prior-version
playback and every render state. Server tests cover structured transform
validation, request identity, ownership, stage fencing and safe projections.

Worker tests cover creative-brief schema, scene timing, provider snapshots,
deterministic retry, no-result failure, cancellation and optional AI fallback.
Real media tests render prompt, clip and upload paths through FFmpeg and fully
decode their H.264/AAC outputs. The CI container continues to run without network
and uses substituted licensed-size fixture bytes for provider transport.

Staging acceptance requires all of the following evidence.

1. A prompt-generated beauty product video and a founder video use relevant,
   licensed stock scenes with audible narration, aligned captions and full decode.
2. A permitted YouTube source completes both explicit-range and automatic-moment
   clipping through the configured token provider.
3. An uploaded source completes trim, speed, crop, fit and all three output ratios.
4. Browser preview and server output agree on trim boundaries, speed and ratio.
5. The previous version remains usable throughout an edit and after a failed edit.
6. Ten different accounts render concurrently and an eleventh waits without a
   debit or duplicate job.
7. Web and Telegram can open, edit and receive the same owned result.

No mode can be labelled production-ready until its corresponding real staging
case passes. Local fixtures prove media behavior and regression safety, not
provider access, creative quality, rights, cloud capacity or delivery latency.

## Release order

Release the workspace in slices that keep current behavior usable.

1. Add structured transform inputs and the desktop/mobile workspace around the
   current video, timeline, caption, music and version components.
2. Add safe render-stage progress and keep the last completed version visible.
3. Add the creative brief, stored scene plan and provider-attribution projection.
4. Add scene replacement and removal against deterministic stock snapshots.
5. Connect and accept the YouTube token provider, stock credentials and staged
   concurrent rendering before enabling those capabilities in production.

Deploy matching Convex schema, functions, worker and frontend for every slice that
changes a job contract. Keep Dodo checkout and AI scenes behind their current
acceptance gates.
