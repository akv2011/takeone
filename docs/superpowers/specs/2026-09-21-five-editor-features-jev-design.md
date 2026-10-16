# Professional Studio, Five Editor Features, and Jev Routing

## Purpose

TakeOne will add five connected capabilities to one professional editing workspace:

1. generate a new scene that fits the current cut;
2. assemble multiple owned shots into an editable first cut;
3. apply the visual language of a reference without copying its media or audio;
4. search owned footage by what is visible and what is said; and
5. edit explicit text and graphic layers directly on the video canvas.

The selected desktop layout has a tool and asset rail on the left, a video canvas in the center, an inspector on the right, and a multitrack timeline below. The existing dark editing surface and TakeOne accent colours remain. On narrow screens, the video stays first and the rail, inspector, and timeline become labelled tabs or horizontally scrolling regions.

The five capabilities share one versioned project and timeline representation. They are released and accepted one vertical slice at a time. Existing completed jobs remain playable throughout edits, and a failed edit cannot overwrite the last accepted version.

## Product principles

- The first useful frame of the editor must appear without waiting for a model call.
- Selecting, searching, previewing, rearranging, trimming, and styling does not spend a generation or credit.
- A generated scene and a final server export have explicit cost confirmation before reservation.
- Provider work is asynchronous. The current video remains editable while a generated scene or export runs.
- Every model output is a proposal. Only an explicit user action adds a candidate or reference-guided change to the timeline.
- The browser never receives GCS object names, provider operation names, model credentials, or another owner's asset metadata.
- Uploaded and reference media require an ownership or usage-rights confirmation. Provider footage retains attribution.
- "Inspired by" means extracting bounded visual traits. It does not mean copying source footage, dialogue, music, characters, faces, or a film's exact composition.

## Shared project and timeline

Add an owner-scoped project record that points to an immutable active revision. A revision contains an ordered, validated timeline document:

- one or more video clips, each referencing an owned upload, completed TakeOne output, licensed provider snapshot, or accepted generated-scene candidate;
- audio clips for original sound, voice-over, and music, with independent gain and ducking controls;
- caption layers backed by retained cue timing when available;
- explicit text and graphic layers with position, scale, opacity, timing, and a bounded animation preset; and
- transitions between adjacent video clips using a closed set of renderable transition types.

Timeline documents use project-relative millisecond times and stable layer IDs. The client may reorder layer IDs and change validated properties, but it cannot submit storage keys, arbitrary FFmpeg expressions, filter graphs, URLs, or provider identifiers. Server normalization rejects gaps, overlaps, negative times, sources outside their media duration, unsupported transition durations, missing ownership, and revisions based on a stale parent.

Each accepted mutation creates a new immutable revision using an optimistic parent-revision check. Local draft state may change freely in the browser. Saving a draft persists a revision without rendering or billing. Exporting snapshots the revision into the existing managed job queue and request fingerprint. Completed exports point back to the exact project revision that produced them.

Legacy completed jobs open as single-clip projects on first edit. Existing caption archives, music attribution, branding, ancestry, and free-tier watermark rules carry forward. Unsupported flattened layers remain pixels and are not advertised as editable.

## Feature 1: generate a matching scene

The Generate tool supports three modes.

### Theme match

The default mode samples bounded frames around the selected insertion point and reads the adjacent scene descriptions. It derives lighting, palette, setting, pacing, shot size, camera movement, and negative constraints. The user supplies the new subject or action. The resulting prompt asks for a new scene with the same visual language without naming protected characters or requesting a reconstruction of the source shot.

### Product lock

The user supplies one to three owned or authorized product reference images. The request preserves the product while changing its action or setting. The UI records the confirmation and shows which assets are being sent to the provider. Logos are not inferred from unrelated video frames.

### Continue shot

The user selects a gap or clip boundary. TakeOne extracts an authorized first frame and, when both sides exist, a last frame. The provider attempts a bridge or extension with the requested action. The UI labels continuity as best effort and always previews the result before insertion.

The first provider adapter targets a configured Vertex AI Veo model with a capability map rather than assuming every model supports every mode. Current Google documentation lists first/last-frame generation for Veo 3.1 models and asset reference images for supported preview models. Theme match may use text-to-video when image conditioning is unavailable. Product lock and Continue shot remain disabled unless the configured model reports the required image/reference capability and staging acceptance has passed.

One request asks for up to three candidates when the provider and account quota allow it. Each candidate is stored privately, fully decoded, probed for streams/duration/aspect, and associated with the initiating project, revision, insertion point, prompt fingerprint, provider/model, attribution or generation disclosure, cost estimate, and operation fence. Candidates do not enter the timeline automatically. Rejected candidates can be deleted after a bounded retention period only when no project revision references them.

Generation is a background job with visible stages: preparing references, waiting for provider capacity, generating candidates, validating media, and ready for review. Starting an accepted provider operation is the billable boundary. Ambiguous starts remain held for operator reconciliation; retries cannot create a second charge or silently launch another operation.

## Feature 2: multi-shot assembly

The default workflow is "draft first." The user selects two or more owned or licensed clips, supplies a goal, target length, aspect, and audio preference, and asks TakeOne to build an editable cut. The system analyzes each clip into bounded segments, proposes an ordered storyboard, and converts the accepted storyboard into timeline clips. It never exports immediately.

The initial assembly supports:

- drag reorder, split, trim, duplicate, remove, and replace;
- clean cut, short cross-dissolve, fade, and dip-to-black transitions;
- preservation, muting, or detachment of source audio;
- one narration and one music lane using existing mixing rules;
- aspect-aware fit or crop per shot; and
- a local preview before server export.

The assembly planner receives only validated asset summaries: duration, orientation, transcript segments, scene descriptions, detected silence, and approved user labels. It returns stable segment IDs, purpose, in/out times, and transition choices. The server resolves IDs to owned media. A planner response that repeats unavailable footage, exceeds source bounds, or cannot meet the target duration fails as a draft and does not spend a render credit.

## Feature 3: reference-guided editing

The user attaches one authorized reference video or image. TakeOne analyzes four selectable visual traits: pacing, colour treatment, typography, and transitions. The approved scope is visual style only. Reference audio, dialogue, narration, source clips, faces, logos, and characters are never copied automatically.

The inspector exposes a separate strength or enable control for each supported trait and an "apply to" scope. A preview shows the derived editable values before they touch the timeline:

- pacing becomes suggested shot lengths and cut locations;
- colour becomes bounded exposure, contrast, temperature, saturation, tint, highlight, and shadow values;
- typography becomes a licensed or bundled font family, weight, size hierarchy, colour, shadow, and placement preset; and
- transitions become members of the closed transition set with bounded durations.

The analysis record keeps trait values and evidence timestamps but not a reusable copy of a remote reference. An uploaded reference follows the same private storage, ownership, size, type, expiry, and cleanup rules as other uploads. If a requested font is unavailable, the preview names the mapped bundled alternative. If the reference contains no reliable text or edit boundary evidence, those traits remain unavailable rather than fabricated.

## Feature 4: semantic footage search

Search covers assets owned by the current account and licensed provider assets already snapshotted into that project. It does not crawl unrestricted web video.

Analysis divides each asset into timestamped moments. Each moment stores:

- asset and owner scope;
- start and end milliseconds;
- transcript text when speech exists;
- a short visual description produced by the configured vision provider;
- deterministic metadata such as aspect, duration, silence, file label, and scene-change score; and
- an embedding for candidate retrieval.

A query first applies owner, project, media-type, duration, and orientation filters. Vector similarity retrieves a bounded candidate set. Jev may rerank the text query against transcript and visual-description text, returning relevance scores or an insufficient-evidence outcome. The browser receives only the top timestamped matches, signed thumbnails or preview URLs, safe match reasons, and confidence bands. Clicking a result seeks its preview; Insert adds only that owned segment to the draft timeline.

Analysis is asynchronous and incremental. Upload completion creates an analysis job, and the asset library shows preparing, searchable, failed, or retryable status. Search remains useful with transcripts alone if vision analysis is unavailable. Low-confidence results are labelled and never auto-inserted.

## Feature 5: direct canvas editing

Canvas editing applies to explicit TakeOne text and graphic layers. Clicking a layer selects it on the video, shows handles and a nearby toolbar, and opens exact properties in the inspector. Supported properties are text, bundled font, weight, size, colour, shadow preset, alignment, normalized X/Y position, normalized scale, opacity, start/end time, and a closed animation preset.

Dragging and resizing update the browser preview immediately and snap to center, edges, and caption-safe guides. Exact numeric inputs and keyboard movement remain available. The timeline has a lane for each selected layer, and trimming the layer changes its visibility interval. Undo and redo group one pointer gesture or one inspector edit into a single command.

The browser and server share one geometry normalizer. Positions are stored as normalized values against the target canvas, then clamped to the safe render bounds. The worker maps validated properties to the existing raster/FFmpeg layer pipeline. Preview and export use the same bundled fonts and animation definitions. Flattened text in an uploaded or old output is visibly marked as non-editable pixels.

## Jev decision adapter

Jev is used only for bounded text decisions. It cannot generate scripts, scenes, descriptions, images, or video, and it does not inspect raw media. The first adapter runs behind `JEV_ENABLED` and uses the Vercel AI Gateway model identifier `typesafe-ai/jev` with zero-data-retention requested where supported.

Eligible decisions are:

1. classify a free-form Studio request into a fixed tool and operation family;
2. identify whether a search query targets speech, visuals, metadata, or a combination;
3. rerank a small set of transcript and scene-description candidates; and
4. verify whether a structured edit summary addresses a bounded user request.

Deterministic parsing remains first for exact controls such as timestamps, speed, ratio, caption style, and known commands. Jev receives requests only when deterministic parsing cannot resolve the intent or when semantic reranking is requested. Every decision includes an `unknown` or `insufficient_evidence` choice. The application acts only above a threshold calibrated on TakeOne-labelled examples. Lower confidence falls back to the existing deterministic path, a generative planner when prose or structured composition is required, or a clarification prompt.

The adapter has a sub-second deadline, no automatic retry on the interactive path, a circuit breaker after repeated provider failures, and aggregate telemetry for decision type, latency, confidence band, fallback reason, and correctness labels. Raw creator prompts, transcripts, reference descriptions, and provider responses are not logged. A shadow phase records Jev decisions without changing behavior. Traffic switches only after a labelled evaluation set shows that Jev meets the accepted accuracy threshold and improves measured p95 latency or cost for that decision.

## Latency and responsiveness budgets

"Almost negligible" applies to interaction latency, not external video generation or final encoding. The measurable budgets are:

- canvas drag, resize, timeline reorder, trim, and local text changes: visible response in the next animation frame, with no network dependency;
- tool switching and opening a prepared project: p95 under 100 ms after required data is loaded;
- local preview seek: p95 under 150 ms on the acceptance device for the standard fixture;
- Jev interactive decision: p95 under 800 ms end to end, with fallback after a 1-second deadline;
- warm semantic search over up to 500 indexed moments in one account: p95 under 1 second;
- starting a background generation or export: acknowledgement and visible job state within 2 seconds; and
- AI-scene and export duration: measured and displayed by stage, with no "instant" promise.

Performance tests report sample count, device, media size, warm or cold state, success-only percentiles, and failures separately. A cached response cannot be used as evidence for provider-generation latency. Ten-account cloud concurrency remains a hosted acceptance gate.

## APIs, ownership, and billing

All project, asset, revision, candidate, search, and export reads are authenticated and owner-scoped. Paginated list projections omit storage/provider internals. Signed media access uses existing short-lived dispatcher routes and exact CORS origins.

Request identity includes the parent revision, normalized timeline, selected candidate or reference analysis, aspect, audio settings, captions, branding, and export profile. The same request ID with different normalized content is rejected before billing. Exact retries return the existing result or in-progress state.

Saving local or server draft revisions, analysis, search, reference previews, and canvas changes uses no generation allowance. AI-scene generation presents its separate credit or cost before starting. Final export reserves one generation under the existing free-or-credit rules. A failed export restores that reservation exactly once. Product pricing for generated-scene candidates must be set from measured provider cost before production enablement; the current one-video credit must not silently absorb an unknown multi-candidate Veo cost.

## Failure behavior

- A late response is fenced to the project, revision, request, and active view that started it.
- Closing or navigating away does not cancel an accepted provider operation; the job continues and reappears in the project.
- User cancellation stops queued local work and requests provider cancellation only when the provider supports it. It never claims an external operation was cancelled without confirmation.
- Failed analysis leaves the original asset usable for manual editing.
- Failed search reranking returns deterministic/vector candidates with a degraded-state label.
- Failed reference analysis leaves the reference attached with a retry action and no partial style application.
- Failed generation preserves every prior revision and records whether a provider operation may still require reconciliation.
- Failed export preserves the draft revision and previous completed output.

## Test strategy

Each feature is implemented as a vertical slice with its own unit, integration, real-media, browser, and hosted acceptance evidence.

Shared contract tests cover ownership, stale revision rejection, request identity, idempotency, billing, signed media, pagination, cleanup, and late-response fencing. Property tests cover timeline normalization, clip bounds, transition overlaps, normalized canvas geometry, and serialization stability.

Worker tests use real FFmpeg for multi-clip assembly, transitions, mixed audio, text/graphic overlays, full H.264/AAC decode, and audio preservation. Network providers are substituted in CI with valid media bytes and recorded contract fixtures. Provider contract tests remain separate from offline CI.

Jev tests use a labelled TakeOne intent and search-query set. They compare deterministic parsing, the current generative route where applicable, Jev shadow decisions, confidence thresholds, fallback behavior, latency, and request cost. No production switch occurs from vendor benchmarks alone.

Browser tests cover keyboard access, mobile tabs, drag/reorder, split/trim, transition changes, generated-candidate selection, reference-trait toggles, search preview/insertion, canvas handles, exact inspector inputs, undo/redo, navigation fencing, and previous-version playback. Tests assert outcomes and persisted timeline state rather than snapshots of implementation markup.

## Demonstration and release acceptance

After each slice passes local tests, record one short video from the actual authenticated site or staging deployment. The final handoff contains five recordings:

1. generate three themed/product/continuation candidates and explicitly insert one;
2. upload at least two shots, build a proposed cut, reorder and trim it, then export;
3. attach a permitted reference and apply only pacing, colour, typography, and transitions;
4. search a real indexed asset by visible action and spoken phrase, preview the timestamp, and insert it; and
5. select a real text or graphic layer on the canvas, move/style/retime it, then compare preview and export.

The recordings must show the URL or environment label, the interaction, resulting timeline change, and playable output. Mockups, substituted network responses, and standalone FFmpeg files do not count as live-site acceptance. Secrets, user identifiers, private object URLs, and provider operation IDs must not appear.

Release acceptance also requires:

- fresh root and backend suites, typechecks, lint, production builds, Terraform tests, and container media smoke;
- real provider acceptance for every enabled generation mode with recorded model and region;
- measured latency against the budgets above;
- ten distinct accounts rendering concurrently with an eleventh waiting without duplicate billing;
- previous-version recovery after injected generation and export failures;
- private GCS access checks and cleanup evidence; and
- clear capability flags for every integration that has not passed hosted acceptance.

## Delivery order

This umbrella design produces six implementation plans and releases:

1. shared project/timeline foundation and the selected professional Studio shell;
2. multi-shot assembly and real local preview/export;
3. direct canvas text and graphic layers;
4. semantic asset analysis/search plus Jev shadow evaluation;
5. reference-guided visual editing; and
6. generated matching scenes, starting with Theme match, then Product lock and Continue shot as provider capability and acceptance permit.

Multi-shot assembly precedes generated scenes because it validates the shared timeline with owned media and real FFmpeg before adding expensive asynchronous generation. Jev does not block the editor foundation: deterministic routing remains available until Jev proves better on TakeOne data.

## External references reviewed

- Jev availability and typed Choice, Score, and Boolean decisions through Vercel AI Gateway: https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway
- Jev model page and current model identifier: https://vercel.com/ai-gateway/models/jev
- Veo first/last-frame generation and supported model parameters: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-first-and-last-frames
- Veo video generation API and reference-image capability: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation
