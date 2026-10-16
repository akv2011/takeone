# Telegram queued-job control

Add `/jobs` as a free owner-scoped list of the five latest jobs, including status, short prompt and deployment-specific Studio link. Add `/cancel JOB_ID` for queued/dispatched jobs using the same helper as the authenticated web cancellation endpoint. The helper verifies ownership, changes status, clears the lease, restores the reservation once and wakes admission. Processing/completed/cancelled jobs cannot be cancelled; invalid and foreign IDs receive non-disclosing guidance. Unexpected database failures propagate and roll back the mutation.

Tests cover free listing, account isolation, exact update replay, repeated cancel messages, running-state rejection and late worker claim/completion after dispatched cancellation. Real Telegram Web command/delivery latency requires connected staging access. Running-provider cancellation is not implied by queued cancellation.
