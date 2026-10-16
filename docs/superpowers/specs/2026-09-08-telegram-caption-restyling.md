# Telegram caption restyling

Extend the existing delivered-video reply flow with exact `captions clean|bold|pop|none` instructions. Preserve `/captions` as a free preference command for future renders. Resolve the replied message through the existing chat/message index and ownership check. Require a completed source and validated paired archive keys; unsupported/missing layers receive guidance without spending allowance. Do not interpret mixed edits as caption-only requests.

Accepted requests use the same managed caption worker as Studio, normal admission/credit checks, update-id deduplication, version ancestry and retained music attribution. Existing audio stays baked in; source-embedded text cannot be removed. A new result is delivered through the existing durable outbox. Tests cover all styles, duplicate events, missing/malformed/foreign sources, settings isolation and queue/credit rejection. Real Telegram Web acceptance remains dependent on a connected session.
