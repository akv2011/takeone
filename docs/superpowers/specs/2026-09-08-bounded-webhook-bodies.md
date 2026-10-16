# Bounded webhook request bodies

Telegram and Dodo previously called Request.text before checking body length;
missing or false Content-Length could cause unbounded buffering. Character counts
also failed to enforce the intended UTF-8 byte caps.

Read into a fixed 64 KiB Telegram / 256 KiB Dodo buffer and reject excess bytes
while streaming. Keep existing pre-body authorization/configuration checks.
Reject declared excess early, malformed UTF-8 with 400, oversized bodies with 413,
and stalled reads after ten seconds with 408. Cancel failed streams without
waiting on arbitrary producer cancellation promises, release locks and timers,
and return safe errors. Preserve exact valid text (including BOM and CRLF) for
signature processing; do not normalize text or stringify parsed JSON first.

Tests cover split multi-byte characters, caps with absent/false headers,
predeclared excess, invalid encoding, timeout and upstream error cleanup, route
byte rejection, and authorization/configuration gate ordering. Existing Telegram
and Dodo suites verify compatible request/payment processing. These tests run in
local edge/convex-test emulation; actual hosted ingress and provider retries still
require staging acceptance. This does not cap direct Convex storage upload
transport or implement general IP rate limiting.
