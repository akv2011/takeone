# Live provider compatibility

Read-only checks found existing local model, transcription and voice credentials.
An actual generation attempt exposed two issues hidden by earlier mocks:
- The configured model rejects temperature=0.8 with HTTP 400, unsupported_value.
  Omit the optional sampling setting and retain the configured model.
- Whisper returns recognized words with start=end. Preserve these words: merge
  zero-duration shared-start words into the next token; otherwise use up to 0.2s
  of caption display time bounded by the next word and provider audio duration.
  Require a finite duration and at least one positive timing anchor. Keep reversed,
  unordered, malformed and unanchored/out-of-duration zero timings invalid. Do
  not mutate the response input. These display repairs are not exact word timing.

Validate strict script/angle compatibility and timing repair/rejection with unit
tests, then real script -> ElevenLabs -> Whisper -> strict Linux caption export.
Use an original creator-tip script and labeled solid-color test visuals. Record
actual stage latency without equating one local run to cloud concurrency or
creator-quality footage. No Telegram messages, webhook updates or production
state changes are required.
