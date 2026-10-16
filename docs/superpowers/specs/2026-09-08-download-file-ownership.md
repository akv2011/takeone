# Download destination ownership

## Problem and required behavior

boundedDownload uses exclusive file creation, but its unconditional failure cleanup deletes an already existing destination after EEXIST. Existing files and symlinks must survive a rejected download. A newly created partial output must still be removed after an oversized source, input failure or cancellation, and the input stream must be destroyed. Already aborted downloads must not create files.

## Design

Retain exclusive createWriteStream and synchronous pipeline attachment. Track the destination open event as evidence that this invocation created the file. Pipeline settles after the destination closes on error; cleanup removes the path only when that event occurred. Check pre-aborted signals before destination creation. This avoids introducing an asynchronous file-open gap before source stream error handling is attached.

Generic GCS garbage collection is separate: completed outputs and caption archives have durable references and must not be expired by an indiscriminate bucket lifecycle policy. This change affects local temporary download destinations only.

## Verification

Two regression tests failed with ENOENT before the fix: existing regular file and symlink. Additional tests check input errors and cancellation before/during streaming; existing tests cover byte caps and valid bytes. Full worker suite and TypeScript build validate callers. No production files are touched by tests.
