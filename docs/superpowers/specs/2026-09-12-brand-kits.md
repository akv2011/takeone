# Brand kits

Owners save up to five named kits, each with a bundled sans/serif/mono caption font, clean/bold-pop/pop-in/no-caption style, six-digit text and outline colors, and an optional uploaded PNG logo. Saving and selecting are free. Applying to a new generation/upload or retained clean Studio version reserves the existing free generation or paid credit. AI scenes are excluded in this slice.

PNG bytes are stored atomically with the kit, bounded to 64 KiB and 512×512. Only raster PNG chunks are admitted; SVG, arbitrary URLs, animation and user fonts are excluded. The worker repeats the structural checks, explicitly decodes PNG, then overlays the raster at the upper-right within a 15% short-edge box. Free-tier platform branding remains present. User-owned embedded source marks cannot be removed.

Selection is `{kitId, revision}`. Owner validation and revision comparison occur before reservation. Jobs store an immutable settings/logo snapshot; exact request retries compare the selection and return the original reservation even after the kit changes. Changed selection conflicts on an existing request ID. Editing a kit increments its revision; a stale selection must be chosen again.

Studio applies a kit through `generate:requestBrandEdit` to an owned completed version with a valid paired clean video and caption archive. Captions are rerendered from retained timing; clean archives omit the logo so subsequent kit application can replace it. Ordinary caption/transform edits inherit the snapshot where clean archives are available. Existing caption wording/font controls remain usable. Source audio and music attribution are preserved.

The frontend uses account-keyed owner queries, local previews and an explicit Apply render action. Saving/file-read responses are fenced to the component lifetime; route/account transitions cannot select an old owner’s kit. Optional brand-query errors are isolated from the player. Kit revisions prevent silent submission of newly edited settings.

Verification covers owner isolation, malformed settings/PNG, bounded kit count, immutable snapshots, exact retry billing, paid claims, archived source requirements, UI free selection/save and late account responses. Real FFmpeg verification decodes a PNG, renders colored captions and the logo alongside free branding, checks frame pixels/audio/duration, and fully decodes the result. Cloud/provider credentials and hosted browser acceptance remain separate owner gates; no deployment is implied.
