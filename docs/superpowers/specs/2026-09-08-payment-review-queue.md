# Payment review visibility

Provide internal-only, read-only Convex queries for finding disputed orders, missing-session reconciliation cases and provider-check failures. Require explicit test/live environment; paginate oldest-first through dedicated indexes with at most 50 records per request. Detail responses use an explicit projection, excluding account identities, checkout bearer URLs and raw provider errors.

Case details expose saved status, provider references, credits purchased/refunded and reconciliation timestamps. Dispute records paginate separately by order and preserve amount as an uninterpreted provider string with an explicit unverified-unit label. They are historical local observations, not fresh provider verification.

No public admin route, mutation, outbound provider call, automatic retry, review clearance, credit hold or deduction is added. These views support investigation; resolution still requires provider revalidation, confirmed credit policy and audited authorization.

Tests must prove internal registration, environment isolation, bounded pagination beyond 50 rows, projection/privacy, source immutability and dispute order binding. Document staging CLI examples, then run full root tests and typechecks.
