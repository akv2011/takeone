# Visual trim selection

Within the authorized editor expansion, add a visible range and playhead to the existing trim/speed controls. Users can seek without spending credits, mark the player's exact current time as start/end, adjust either boundary with native keyboard-accessible sliders, retain millisecond numeric input, preview, and explicitly submit the existing deterministic trim instruction.

Use native controls and the existing player, rather than a third-party timeline or server thumbnail service. This adds no provider dependency or media download duplication. It is a time-based selection interface, not a frame-index editor. No thumbnails or waveform are implied. Re-rendering still consumes one generation through the existing owner-scoped request path.

Controls require finite positive media duration, capped at the supported 300 seconds. Display/playhead updates follow player events; mark buttons read currentTime directly when clicked. Seeking pauses playback, clears range preview, resets speed and seeks the current version. Version changes reset timeline state. Marking an invalid boundary shows existing validation and cannot render. Native range inputs constrain crossing. No seek/mark action submits a job.

Verification covers numeric/range synchronization, disabled/unknown duration, current-time marks, invalid/crossing boundaries, free seek/preview and paid apply payload in Studio. Existing deterministic router/media trim tests verify instruction/render behavior. Browser inspection should use a local fixture player; authenticated cloud acceptance remains separate.
