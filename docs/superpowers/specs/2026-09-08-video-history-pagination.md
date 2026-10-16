# Accessible older video history

Dashboard history uses Convex's reactive paginated-query hook, 20 results initially and per Load older videos click. The query enforces 1–50 items per page and authenticates the owner against the requested account key. Including the Clerk account key in hook arguments resets accumulated pages when accounts change; mismatched identity yields no data. The indexed user query returns only tile fields, excluding large caption arrays, leases and private worker state. Pagination is cursor-based and reactive through the official installed Convex hook, including its duplicate-load guard.

Tests create 65 own jobs plus a foreign job, traverse all pages without duplicates, enforce authentication/page bounds and confirm restricted projection. UI tests cover auth skips, account key, load-more and loading state. This resolves the dashboard's latest-50 ceiling; per-project version history and payment history have separate pagination work.
