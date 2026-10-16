# Checkout response lifetime fix

Reproduced three failures: creation and resume responses navigated after Pricing unmounted; an account switch retained the previous account's pending UI/redirect. Pricing content now remounts when the Clerk account ID changes. Creation/resume callbacks check their component lifetime before navigation or error side effects. Late failure cannot clear the saved retry ID. Browser navigation is isolated in openCheckout for test observation.

The fix does not cancel a server action or compensate/duplicate a provider checkout. Orders remain owned by the authenticated server identity and recoverable through existing history/reconciliation. Active current-account creation/resumption still navigates. Existing attempt idempotence and ledger behavior are unchanged.

Verification: all three reproduction tests failed before the guard and passed after. Added positive create/resume navigation and late-failure retry-preservation cases. Full root suite 266 passed; build and lint passed (eight existing warnings). Tests observe the navigation boundary without opening a hosted payment page; live merchant sandbox acceptance remains pending.
