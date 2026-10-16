# Purchase history implementation record

Goal: retain access to purchases/refunds beyond the latest 25 orders.
Architecture: share display projection between the compatible history query and the new listHistory query; use account-bound Convex pagination in Pricing.

- [x] Add paginated history with authentication, account binding and page bounds.
- [x] Preserve paid/refund/dispute/recovery display fields while excluding provider/session details.
- [x] Connect loading and Load older purchases UI with auth-based reset.
- [x] Add 55-order traversal, isolation, balance-preservation and no-checkout UI tests.
- [x] Finish broad validation and record results.
