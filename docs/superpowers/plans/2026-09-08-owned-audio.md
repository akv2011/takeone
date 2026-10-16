# Creator-owned soundtrack implementation plan

Goal: use a personal licensed audio file in an exported video.
Architecture: extend upload records with optional kind (legacy = video), resolve owner tracks at render admission, pass claimed storage URLs into a shared bounded soundtrack downloader, and expose upload/preview/removal in MusicPicker.

- [x] Extend upload validation/schema and owner-track resolution/preview.
- [x] Pass claimed audio to both stock/edit and AI worker mix paths; protect active sources.
- [x] Add upload rights, progress, cancellation, selection and removal UI.
- [x] Run ownership, billing, UI, worker and real media checks; update acceptance evidence.
