# Render submission identity

The shared queue must return a prior job only for the same render content. Compare mode, trimmed prompt, default-normalized aspect/generation kind, captions and wording, source identifiers, ancestry, destination and selected music/mix. Exclude evolving lease/status/output/billing fields and catalog display metadata. No extra fingerprint migration is required: existing stored input fields allow comparison for old jobs too.

A changed input with the same owner/request ID raises REQUEST_CONTENT_CONFLICT before billing, insertion or catalog resolution. An exact retry returns the original job, including after admission or catalog removal. Tests cover changed prompt/aspect/style/wording/music, omitted defaults, changing runtime state and unchanged balances. Telegram's provider-update replay deduplication remains its first boundary.
