# Verified checkout expiry recovery

Use the existing owner refresh and scheduled reconciliation to inspect a known Dodo checkout session. Only when its returned ID matches, payment_id and payment_status are explicitly null, and provider created_at is at least 24 hours plus five minutes old, mark the order expired. The internal mutation rechecks order/session binding, absence of captured payment and observation ordering. Unknown/malformed timestamps, missing session and provider errors do not authorize a new attempt. Continue reconciliation of expired orders so any contradictory late success is still handled through verified idempotent fulfillment.

A later attempt to open a verified expired order returns CHECKOUT_RETRY_ALLOWED. Pricing clears only the matching cached request and asks the user to click again for a new checkout; no automatic POST. Return-page expired state also clears the matching cached ID. Existing ambiguous creation remains for operator review. Test provider binding, null fields, boundary time, paid-order protection, fresh timestamps and retry identity behavior. No deployment or sandbox charge during local validation.

Source: https://docs.dodopayments.com/developer-resources/checkout-session (24-hour default); https://docs.dodopayments.com/api-reference/checkout-sessions/get-checkouts (created_at and nullable payment fields), reviewed 2026-09-08.
