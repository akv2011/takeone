# Incomplete artifact bundle cleanup

The worker uploads final video, optional clean video and caption metadata before
calling completeJob. A failure partway through that bundle can leave objects
which were never attached to a completed job.

Use create-only generation preconditions and one random upload-attempt metadata
marker for the bundle. If upload throws, inspect only keys attempted by that
invocation. Delete only when the marker matches and a valid generation is known,
using that exact generation as a delete precondition. A colliding existing object
is neither overwritten nor removed. Metadata/deletion failures preserve objects
for reconciliation and produce aggregate counts, never raw provider errors.
Cleanup/logging failure must not mask the original upload error.

The helper returns only after all uploads succeed. archivedKeys is assigned only
afterward, and completeJob remains outside this helper. No cleanup runs on a
successful bundle or on uncertain/rejected completion. No table/bucket sweep,
completed-output retention, AI provider intermediate cleanup or historical orphan
recovery is included. Forced process termination can still bypass cleanup.

Tests use actual file streams and a simulated object store to exercise committed
writes followed by response loss, ownership mismatch, conditional deletion races,
metadata/logger failures, success and pre-abort. Existing worker lifecycle tests
cover uncertain completion. SDK types and Google request-precondition semantics
are checked, but actual GCS operations require isolated staging acceptance.

## Installed SDK integrity-check behavior

An HTTP-level test with the real installed SDK found that checksum mismatch invokes File.delete internally. Stream-only preconditions did not fence that delete. The upload File instance now also carries ifGenerationMatch=0; implicit deletion fails closed, followed by explicit ownership/generation-checked cleanup. A loopback HTTP fixture verifies both the original owned object and replacement by another writer. This keeps checksum validation enabled.
