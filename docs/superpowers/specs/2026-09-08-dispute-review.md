# Dodo dispute ingestion and review

This implements verified observations and a fulfillment guard, not the complete dispute credit lifecycle. Checkout must remain disabled until credit holds, deductions, restoration and real sandbox acceptance are complete.

Signed dispute events trigger canonical dispute and payment lookups. The payment must match the saved order's business, environment, checkout session, product, quantity and USD capture. The dispute must bind to that payment/business/currency and use a recognized status/stage. Store only the reference, amount string, currency, status/stage, creation and observation times; do not persist customer/card details or provider remarks.

Observations deduplicate by dispute ID and reject binding changes. An older local lookup-start timestamp cannot overwrite a newer observation. This is request-order protection, not proof of provider event ordering: the API lacks an update sequence in the reviewed response. All statuses require review, including won/cancelled; none automatically restores credits.

Payment/refund reconciliation records embedded disputes before independent credit mutations. A disputed purchase cannot receive its initial grant, including a refund-before-capture attempt to grant the remainder. Existing credited balances are not deducted by this layer; existing refund behavior remains. Owner-scoped history displays the review flag and order reference. The raw dispute amount is never interpreted as cents or dollars.

## Remaining policy and acceptance

- Confirm dispute amount units and partial-dispute behavior in the actual merchant sandbox.
- Decide whether unresolved disputes hold a whole pack or a proportional amount, and how spent credits affect balances.
- Implement atomic refund/dispute overlap accounting so a credit is not revoked twice.
- Implement restoration and operator review with authenticated authorization, immutable audit events, and provider-state revalidation.
- Exercise out-of-order events, challenge/arbitration transitions, replay, multiple disputes and real settlement outcomes before enabling checkout.

Sources reviewed on 2026-09-08: [dispute detail](https://docs.dodopayments.com/api-reference/disputes/get-disputes-1), [payment detail](https://docs.dodopayments.com/api-reference/payments/get-payments-1), [event guide](https://docs.dodopayments.com/developer-resources/webhooks/intents/webhook-events-guide). These describe transport fields/events; they do not determine TakeOne's credit policy.
