# TakeOne launch readiness implementation plan

**Goal:** Make the public product truthful and safe to operate before the real GCP project and provider accounts are connected.

## Product behavior

- Publish one server-owned capability snapshot for rendering, stock generation, YouTube clipping, AI video, Telegram, payments, and music.
- Hide or disable actions that cannot succeed, with a short explanation and no provider secrets.
- Keep all managed GCP resources parameterized by `project_id`; never default to or deploy into `previous-unrelated-project`.
- Add Privacy, Terms, Acceptable Use, Copyright, and Refund pages and link them from the product.
- Keep checkout, Telegram, and rendering fail-closed until their complete configuration is present.

## Operations

- Add an aggregate internal launch-readiness query that reports missing configuration and stale legacy jobs without exposing identifiers or secrets.
- Add a manual GitHub Actions deployment workflow that uses Workload Identity Federation, requires an explicit project ID, builds a digest-addressed image, and runs Terraform plan by default.
- Document the exact owner connections and migration order for the future production project.

## Verification

- Unit-test capability truth tables, public route copy, UI gating, and readiness output.
- Run root and backend tests, builds, Convex typecheck, lint, Terraform format/validate/tests, and production container smoke through CI.
- Open a ready-for-review pull request, inspect every remote check, fix regressions, and merge only after all required checks pass.
