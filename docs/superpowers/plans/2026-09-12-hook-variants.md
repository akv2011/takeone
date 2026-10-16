# Opening hook variants implementation

Goal: three versioned title-hook exports from one owned video.
Architecture: atomic Convex batch admission, immutable hook title claim, direct worker title operation and free Studio preview.

- Add `convex/hookVariants.ts` bounded three-title mutation; tests assert exact retries, distinct titles, insufficient credits rollback, owner isolation and three claimed snapshots.
- Add hookTitle to schema, request fingerprint and worker claim; retain captionTransformSource for paired archives.
- Add direct render branch for flattened sources and explicit title operation to archive transforms, bypassing routing. Test strict validation and real FFmpeg first/late frames, audio equality and full decode.
- Add Studio HookVariants controls with three editable titles, title-on-player preview and paid batch links; test no debit on preview and stale-response handling.
- Run root/backend relevant suites, builds, Convex typecheck; self-review and ready PR with Linux CI and clearly scoped local browser evidence.
