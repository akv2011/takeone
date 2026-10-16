# Studio version history implementation record

Goal: reach older project versions beyond the fixed 50-edit window without spending allowance.
Architecture: original-only query plus owner-scoped paginated edit query, using the existing root/user index. Account-key and selected-job arguments reset the client cache. Return projected history fields only.

- [x] Add optional root-only/account-key handling to the compatible versions query.
- [x] Add listVersions with selected/root ownership, account-key and page-size validation.
- [x] Connect Studio pagination and load-more state; keep original sticky in the history list.
- [x] Verify 65-edit history, isolation, projection, invalid input and free UI navigation.
- [x] Complete broad validation and record its result.
