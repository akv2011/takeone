# Caption archive branding implementation plan

1. Reproduce platform branding replay into the clean archive with a real-file regression.
2. Add internal watermark platform marker at all platform operation construction points.
3. Skip only that marker in archive replay; preserve ordinary creator marks and final entitlement behavior.
4. Update exact operation-contract tests and add container free/paid archive branding checks.
5. Run relevant full backend tests/build/lint and refreshed production-container smoke; document legacy limitations.
