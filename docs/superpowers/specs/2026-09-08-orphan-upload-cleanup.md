# Abandoned upload storage cleanup

Add internal, paginated maintenance for Convex upload blobs. Upload finalization expires after one hour; cleanup only considers blobs older than 24 hours. Never expire saved sources or completed videos. Protect every upload storageId, every genJobs sourceStorageId, and every musicStorageId regardless of job status. Future features storing Convex blobs must add their reference checks here before deployment.

Mode UPLOAD_CLEANUP_MODE defaults to audit; off performs no scan; delete uses the same transactional checks and removes only unreferenced blobs. Each minute handles one page of at most 100 storage metadata rows. Persist a stable cutoff/cursor across pages so protected old files do not prevent reaching later orphans. A completed sweep resets its cursor for the next sweep. Store counts, run time, completion time, total scanned/deleted; no file names/URLs in logs. Invalid configuration fails closed. An internal status query supports operational review without scanning files or exposing IDs.

All reference checks and deletes occur in one Convex mutation. Finalization and deletion therefore participate in transactional conflict handling. The 24-hour cutoff additionally separates eligibility from the one-hour finalization window. Dry-run approval is operational staging acceptance, not a requirement to pause local implementation. No production cleanup is invoked by this work.

Tests: audit versus delete/off modes, grace period boundary, every reference class, late reference insertion before delete, pagination across protected rows, repeated sweeps, expired finalization and privileged-only access. Document that this handles Convex orphans only; GCS incomplete artifacts and upload transport byte caps remain separate work.
