# Creator-owned soundtrack uploads

Extend the authorized editor/music feature with owner-private audio uploads, using existing upload storage and the same five/hour, ten-ready total limits. Audio supports MP3/WAV/M4A MIME types up to 20 MiB; begin requires an explicit exported-video rights confirmation. Finalization checks actual stored size and MIME. Video upload queries and edit-source submission must exclude audio. This is application validation after upload, not a transport byte cap.

The music picker merges the approved catalog with the signed-in owner's audio entries. Free preview resolves only owned ready audio. Render admission snapshots its storage ID and mix settings, tracks an indexed musicStorageId for deletion protection, and preserves idempotence. Only a successfully claimed worker receives its download URL. Worker permits HTTPS Convex storage URLs, bounded streaming and cancellation, and rejects missing/invalid media through the existing failure/refund path. This does not guarantee that a MIME-labelled file contains valid audio; the renderer must probe it.

Removing unused audio deletes the source, not finished exports. Active renders block removal. Future explicit soundtrack reuse requires the uploaded source to still exist. Embedded audio in old exports remains. Web upload/selection works for web renders; Telegram lists and selects owner-uploaded tracks through /music and the shared account preference, but uploading audio via a Telegram message is separate work.

Test owner isolation, rights/type/size validation, video/audio separation, duplicate upload/job submissions, claimed URL delivery, active-source deletion protection, bounded worker download and actual local mixing. No paid provider or cloud deployment is implied.
