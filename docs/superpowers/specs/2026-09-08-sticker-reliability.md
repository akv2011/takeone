# Reaction sticker fulfillment and layout

Within the approved expanded-editor scope, fix existing GIF overlays rather than add a new provider or user flow. Production must not report a requested sticker as successful when it is missing. Explicit offline fallback remains.

Downloads use the existing boundedDownload helper, 20 MiB actual-byte cap, parent cancellation combined with 15s search/30s download deadlines, unique owned partial files, positive GIF video metadata and atomic versioned cache publication. Preserve unrelated files and propagate job cancellation.

Scale GIFs into a box no wider than 35% of the short canvas dimension and no taller than 25% of canvas height, preserving aspect. Position top left/right/center using relative margins. Test small landscape, square and portrait frames.

Validation: mocked HTTP plus real filesystem cap/cancel/cache tests; strict missing/success tests; real Linux GIF overlay/frame/audio/decode smoke. Actual GIPHY credentials, rights, live selection and cloud testing remain owner connection gates.
