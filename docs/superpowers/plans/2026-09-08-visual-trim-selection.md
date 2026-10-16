# Visual trim selection implementation plan

Goal: choose and preview a clip while watching the source in Studio.
Architecture: extend TimelineControls with optional player callbacks and time state; Studio owns media playback and existing generation submission. Native ranges and numeric inputs share one selection state. No new backend contract.

- [x] Add visual selection, seek and boundary controls with validation and accessible labels.
- [x] Connect player time/metadata, exact mark reads and pause/reset/seek behavior in Studio.
- [x] Test controls and Studio request isolation; run relevant deterministic render regressions.
- [x] Build and inspect local UI; record evidence and remaining cloud gates.
