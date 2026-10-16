# Reaction sticker implementation plan

Goal: fulfill requested stickers visibly and safely across supported canvases.

1. Add downloader regressions in backend/src/media/gifs-download.test.ts (real streams/files; HTTP and metadata mocked). Observe failures.
2. Update gifs.ts with bounded streaming, cancellation, owned atomic publication and GIF validation.
3. Pass signal and reject missing effective stickers in media/index.ts; preserve explicit offline fallback.
4. Replace fixed gifGraph geometry with bounded relative scaling/position; test dimensions.
5. Run focused/full backend suite, build, lint and real Linux rendering before recording evidence. No cloud mutation.
