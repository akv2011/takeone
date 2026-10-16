# Review-link validation, 2026-09-12

Owners explicitly create a capability for one completed managed video version. Sharing does not send messages or spend render credits. Tokens contain 256 random bits, travel in a URL fragment, and are stored only as SHA-256 digests. Creating a replacement revokes the prior live capability for that version. Inactive histories can be deleted with their feedback.

## Local evidence

- 27 Convex tests cover owner isolation, public projections, malformed/expired/revoked capabilities, exact completed-object binding, comment idempotency and concurrent quotas, deletion, two-minute signing and revocation during signing.
- Six component tests cover actual video elements, seek/playhead feedback, retry identity, expiry/revocation and late responses, explicit owner creation, and playback refresh position.
- Privacy tests cover unauthenticated review boot, alternate route spellings and suppression of delayed analytics events containing capabilities. The public route bypasses Clerk and PostHog initialization; the route response applies no-referrer, no-store and noindex headers.
- Dispatcher tests reject non-video keys and caller-selected signing lifetimes. The review endpoint signs only canonical final MP4 keys for two minutes.
- A headless Chromium session loaded the actual public route and owner sharing component with a real 24.54-second MP4. It created a link by owner click, submitted a guest note at 2.875 seconds, sought to that time from both guest and owner notes, refreshed playback while preserving that position, resolved the note, then revoked the link and observed removal of the guest player. Desktop and 390-pixel mobile views had no overflow, page errors, or Clerk/PostHog requests.

## Limits and deployment acceptance

Browser Convex/signing transport was a local fixture; media bytes and browser playback were real. API authorization and quotas were tested separately using convex-test. No deployment, production capability or outbound review message was created.

Creation is capped at five links per account per hour and 100 retained histories. Each capability permits 200 notes total, ten notes per minute and 20 playback-signing requests per minute. Guest names are unverified. A holder can consume the shared quota; there is no per-person identity claim. Owners may revoke compromised links and create replacements within their quota.

Revocation and expiry stop new API access. Previously issued playback URLs may remain usable for up to two minutes; downloaded copies cannot be recalled. Timestamp bounds use the owner's loaded duration, capped at 300.1 seconds; they are not an independently verified duration attestation. Final output keys appear within their signed GCS URLs, while source and caption keys are never exposed by the review API.

Staging still needs coordinated Convex schema/functions and worker deployment, actual private GCS signing and CORS playback, multi-viewer quota behavior, and deployed response-header acceptance. These checks do not establish those cloud conditions.

## Feedback summaries, 2026-10-17

Once a version has 3 or more guest notes across its review links, the owner can ask Gemini to summarize them. Convex gathers at most 200 notes from at most 100 links, newest link first, and sends only each note's id, timestamp and text to the dispatcher's `/summarize-feedback` route. Reviewer names stay in Convex. The dispatcher replaces ids with 1-based indexes before calling Gemini, puts the notes in their own JSON part, and tells Gemini the text is untrusted viewer input whose instructions it must ignore. The route accepts at most 640 KiB, the same bearer secret as the other routes, and 3 to 200 notes.

Gemini must return an overall sentiment (positive, mixed or negative) with a one-line reason, 1 to 3 repeated themes, and a sentiment for every note exactly once. The dispatcher rejects any extra key, missing or repeated note, unknown sentiment, multi-line reason or over-long theme, and returns 502 without provider detail. Convex checks the shape again, joins each note's timestamp from its own records and stores only the latest result per version. Studio shows it with a line saying Gemini generated it, from how many notes and when, and marks each summarized note on a timeline strip that seeks the player.

Each version allows 3 summary requests per hour. Convex counts a request before it calls the dispatcher, so a failed Gemini call still uses one. Deleting a review history also clears a stored summary built from its notes. These checks used convex-test and mocked HTTP; no Gemini call was made.
