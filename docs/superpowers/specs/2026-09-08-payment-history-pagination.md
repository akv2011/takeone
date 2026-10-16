# Complete purchase history

Page purchase/checkout history in groups of 20 using the existing owner index. Preserve the existing projection, including refund/dispute state, paid amount and checkout-resume eligibility. A required account key resets accumulated UI pages and must match the authenticated identity; cap each page at 50. Retain the legacy 25-row history query for compatibility, sharing its projection with the paginated query. No checkout API calls, ledger mutations or credit changes occur while loading history.

Use native Load older purchases and loading states. Tests traverse more than 25 records without duplicates or foreign rows, validate page bounds/authentication, preserve refund/recovery display and prove UI load-more makes no action call. Real merchant sandbox receipt/reconciliation acceptance remains separate.
