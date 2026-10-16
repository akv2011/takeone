# Nonterminal payment observations

Canonical payment reconciliation records the documented customer-action, merchant-action, payment-method, confirmation, capture and partial-capture states. These states never grant credits and never reset checkout attempt IDs. History, return-page and refresh UI explain the required action, distinguishing authorization/partial capture from a completed pack purchase. A stale observation cannot replace newer status or a captured payment; equal-time failed/cancelled observations take precedence over nonterminal states. Record lookup-start time consistently rather than completion time.

Tests must cover every state, unchanged balance/ledger, later full capture, late nonterminal observations and user-visible guidance. Actual provider transitions require the Dodo sandbox. Checkout resume links and ambiguous creation/operator recovery remain separate work.

Source reviewed: https://docs.dodopayments.com/api-reference/checkout-sessions/get-checkouts (2026-09-08, documented provider intent states).
