# Caption placement

Studio caption edits offer keep saved position, style default, top, middle and bottom. Positions use a closed enum; the ASS builder maps them to centered alignment with existing canvas-scaled margins. Do not accept arbitrary ASS or filter text. This changes caption placement only, preserving cue timing and audio. The queue stores captionPosition, includes it in retry identity and forwards it to the worker. Later web and Telegram caption restyles inherit the saved job position unless explicitly overridden. Original source-embedded captions are unaffected.

Validate exact alignment, invalid-value rejection, web submission, version inheritance, retry conflict, and real Linux frame/audio/decode checks. Freeform coordinates, fonts and exact platform-specific safe-area previews remain separate work.
