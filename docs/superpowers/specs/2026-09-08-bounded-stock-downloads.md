# Bounded, cancellable stock downloads

Stock searches previously ignored the job signal, and downloads buffered entire
responses before writing directly to the shared cache filename. Cancelled jobs
could keep downloading; concurrent same-key requests could observe partial files.

Pass the existing job signal through both stock call sites, provider searches,
download streaming and FFprobe. Retain per-search 15-second and download/probe
60-second ceilings. Provider failure still returns null; caller cancellation
propagates instead of attempting a fallback. Enforce 50 MiB of actual bytes using
the existing bounded stream helper, regardless of Content-Length. Validate
positive-duration video metadata before atomic rename into a versioned cache.
Use unique partial filenames; clean up only a file this invocation created.
Ignore old cache names, without deleting historical files. Concurrent requests
may still download separately, but only complete validated files are published.

Tests cover byte caps and bounded read-ahead, search/stream cancellation, invalid
media, concurrent publication, cached reuse, legacy cache, pre-abort and exclusive
partial-file collisions. A real MP4 fixture exercises file streaming and FFprobe
with mocked HTTP only. This does not establish live stock-provider behavior,
licensing, full decode of every cached asset, historical cache cleanup, or a
complete network-address/redirect security policy.
