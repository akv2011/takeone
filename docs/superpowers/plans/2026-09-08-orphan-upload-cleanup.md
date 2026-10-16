# Orphan upload cleanup implementation plan

Goal: bound abandoned-file storage without deleting saved media.
Architecture: one internal maintenance mutation pages storage metadata, checks indexed references and records sweep state. A minute cron runs audit by default; environment mode selects off/audit/delete. Internal status exposes counts only.

- [x] Add sweep state, cleanup mutation/status and cron.
- [x] Test grace period, references, mode changes, pagination, replay and authorization.
- [x] Verify types/build and document staged enablement, limits and remaining cleanup gaps.
