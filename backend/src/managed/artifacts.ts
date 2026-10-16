import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Bucket } from '@google-cloud/storage';
export type Artifact = { path: string; key: string; contentType: string };

/** Only cleans an incomplete bundle, before the caller can attempt finalization. */
export async function uploadArtifacts(bucket: Pick<Bucket, 'file'>, artifacts: Artifact[], signal: AbortSignal, log: (event: string) => void): Promise<void> {
  const attempt = randomUUID();
  const touched: string[] = [];
  try {
    for (const artifact of artifacts) {
      signal.throwIfAborted();
      touched.push(artifact.key);
      // The SDK also calls File.delete on checksum mismatch. Keep a create-only
      // instance precondition so that implicit delete cannot remove a live object.
      // Our explicit cleanup below uses the verified owned generation instead.
      await pipeline(createReadStream(artifact.path), bucket.file(artifact.key, { preconditionOpts: { ifGenerationMatch: 0 } }).createWriteStream({
        resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: artifact.contentType, cacheControl: 'private, max-age=0', metadata: { takeoneUploadAttempt: attempt } },
      }), { signal });
    }
  } catch (error) {
    let removed = 0, preserved = 0, failed = 0;
    for (const key of touched) {
      try {
        const [metadata] = await bucket.file(key).getMetadata();
        const generation = String(metadata.generation ?? '');
        if (metadata.metadata?.takeoneUploadAttempt !== attempt || !/^[1-9]\d*$/.test(generation)) { preserved++; continue; }
        await bucket.file(key, { preconditionOpts: { ifGenerationMatch: generation } }).delete({ ignoreNotFound: true });
        removed++;
      } catch { failed++; /* Preserve uncertain objects for later reconciliation. */ }
    }
    try { log(JSON.stringify({ event: 'takeone.incomplete_upload_cleanup', removed, preserved, failed })); } catch { /* Logging cannot change failure/refund handling. */ }
    throw error;
  }
}
