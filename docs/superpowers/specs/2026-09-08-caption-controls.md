# Caption controls and restyling

The expanded editor needs explicit creator control over captions. Prompt-only styling is difficult to discover; an arbitrary style editor would require a larger rendering contract. The implemented first step is a small selector backed by the existing, tested ASS styles. The broader goal still includes restyling completed videos.

## Current render contract

Web stock generation, YouTube clipping and owned upload edits accept an optional `captionStyle`: clean, meme, karaoke or none. Omission preserves prompt-based behavior. The selector describes these as clean static text, uppercase bold pop, short-phrase pop-in, or no added captions. This does not promise word-by-word highlighting. AI scenes reject explicit caption settings until their separate renderer supports them.

Convex validates and saves the selection before admission; claims transmit it to the worker. The gateway changes only caption operations, preserving other edits. Explicit styles add captions after transformations and before the watermark when absent from the prompt. None removes automatic caption operations; generated narration remains, while the unnecessary transcription call is skipped. Invalid settings cannot consume an allowance.

Telegram stores the same optional style on the linked account. `/captions` shows the current preference and usage. `/captions auto|clean|bold|pop|none` sets future request defaults; bold maps to meme and pop to karaoke. Settings commands use no allowance, including after free videos are exhausted, and malformed commands preserve the old preference. Each submission snapshots the setting so subsequent changes do not alter queued or completed jobs. Preferences remain isolated between linked Telegram identities and do not silently change the web form.

## Existing exports

Current result files contain burned captions. Adding another caption operation cannot erase them. The UI warns that source text remains, and the completed-version editor does not advertise restyling. Supporting that requires a retained clean render and timed transcript, fenced private artifact persistence, transform-aware caption timelines and migration behavior for older jobs without clean artifacts. Do not implement restyling by painting text over an already captioned export.

## Validation

Check selector submission/AI hiding, job persistence and worker claims, duplicate billing, upload propagation, invalid values, operation ordering, no-caption transcription avoidance and uppercase narration cues. Run strict Linux caption rendering and full decoding for each style. Real footage, speech recognition, fonts and creator-quality review in staging remain separate acceptance gates.
