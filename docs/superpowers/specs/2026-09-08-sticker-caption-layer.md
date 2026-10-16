# Editable captions on sticker reels

The existing edit planner puts GIFs after captions. The managed caption archive refuses provider-backed replay, so these reels have no editable caption layer. Move planned GIF overlays immediately before captions. The queue then captures the exact composited source as the clean base; no repeat provider lookup is required. Captions intentionally appear above stickers. Do not relax the archive replay allowlist.

Preserve all other operation order, caption-off behavior and failure rules. Verify planned orders have archivable following operations, then use real Linux GIF+caption rendering and archive removal/restyling to confirm the sticker survives, audio is unchanged and provider requests are not repeated. Existing post-caption unsupported operations remain unarchivable.
