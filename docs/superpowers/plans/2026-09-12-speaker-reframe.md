# Follow-speaker implementation

Goal: one-click tracked portrait crop for owned single-speaker videos.
Architecture: bounded server job flag, strict sampled vision path, interpolated numeric FFmpeg crop, paired caption restoration.

- Add validated tracking module with at most30 samples/60s, explicit key/model, abortable frame/provider operations and bounded response. Fail malformed/ambiguous positions; numeric interpolation only.
- Add media speakerReframe operation and allow it in caption archives. Test moving synthetic subject centered in actual encoded frames and identical decoded audio.
- Add owned mutation plus job schema/fingerprint/claim and direct worker branch; tests exercise owned source, no-debit rejection, request replay and archive selection.
- Add Studio control with truthful limits, one-generation cost and scoped async results; verify UI and integrated actual player.
- Run relevant tests/builds/typecheck, self-review and separate ready PR; inspect all remote CI and integrate with other approved features after review.
