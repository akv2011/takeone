# Caption font presets

Within the approved expanded editor, offer bundled DejaVu Sans, Serif and Sans Mono on existing caption layers. Keep saved font by default. This reuses caption restyling (one generation), owner/archive checks, timing, audio, retries and version history. No arbitrary font paths, remote fonts or uploads. Existing undefined values retain their current rendering.

Add optional captionFont to job schema, enqueue identity, worker claim and render contract. New caption edits inherit the source font unless explicitly selected. Telegram accepts captions STYLE [sans|serif|mono] only when replying to a delivered owned editable video; defaults for new generations stay unchanged. Invalid selections fail validation before spending. Wording correction and removal retain the saved font for later restyles.

Test UI submission, server validation/idempotence/inheritance/claim, Telegram commands and ASS injection rejection. Render each family using real Linux libass, compare frames and audio, decode exports, then run relevant full suites. Hosted UI/bot/GCS acceptance remains a separate connection gate.
