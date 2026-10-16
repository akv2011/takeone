# Sticker caption layer implementation plan

1. Reproduce the planner's loss of archive eligibility with a focused assertion.
2. Move GIF operations before captions in applyEditPlan; retain the archive replay allowlist.
3. Test operation order, archive eligibility and existing planning behavior.
4. Extend real container smoke to export a planned GIF+caption reel, retain its clean base and remove captions while preserving the sticker/audio without refetching.
5. Run backend suite/build/lint and the refreshed container; record evidence.
