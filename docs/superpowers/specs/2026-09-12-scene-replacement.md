# Replace a saved scene with an owned clip

A completed stock version with an exact-attempt scene plan and retained clean
composition can replace one scene using a ready video in the owner's upload
library. The full retained composition is the immutable asset for all unchanged
scenes. No provider search, script generation or narration generation occurs.
The replacement starts at its first frame, crops to the existing canvas and must
cover the selected scene. Its audio is discarded. The original composition's
entire audio stream, caption timings/text/style and scene boundaries remain.
Encoding may change compressed video bytes; decoded unchanged frames must remain
visually equivalent. Scene timing is aligned to the existing video frame grid.

The owner mutation snapshots the exact source archive, uploaded storage identity
and updated scene metadata, then uses normal reservation/idempotency/version
rules. The replacement metadata says only that it is a creator-uploaded clip.
An identical retry cannot spend again. Changed source, scene or upload under the
same request ID rejects. Active sourceStorageId references protect replacement
uploads from removal/cleanup. Worker downloads remain private, bounded and
cancellable. Completion uses the existing exact job/lease archive keys and owned
bundle cleanup. Later swaps use the newly retained composition.

New eligible stock renders retain a caption-free composition even when captions
are disabled, with an empty timed layer. Existing outputs without a trustworthy
archive stay unavailable. The UI shows the owner video library for each eligible
scene, explains audio preservation and reservation, and creates a new version.
It does not offer provider-query guessing or edits on metadata-only old outputs.

Validation covers ownership, replay/conflict billing, source type, cleanup
references, exact lease/plan/archive completion, cancellation and failed render
refund behavior. Real FFmpeg tests compare unchanged decoded scenes and the full
audio stream, verify the selected scene changes, retain caption data and fully
decode the output. Cloud/provider acceptance remains separate.
