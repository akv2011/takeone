# Telegram reply editing

Users reply to a bot-delivered video with trim, speed or framing instructions. The delivery outbox records Telegram's returned message ID only when it belongs to the expected chat and the delivery attempt still owns the claim. An index resolves chat/message IDs to completed jobs; the linked user must own the source. No source storage key is accepted from Telegram message text.

Submission creates a normal managed edit with parent/root ancestry, the saved source key and the source aspect unless an explicit aspect is requested. Web history can therefore show the same version chain. Webhook replay protection and the existing reservation/queue machinery apply unchanged. Unknown or foreign reply targets, empty instructions, unsupported commands and burned-caption restyling requests do not debit allowance. Replying yes to a pending rights confirmation retains the original clip flow.

Reply edits retain source audio and caption pixels. Caption and music preferences apply to new topic/clip/upload requests and are not reapplied to these edits. Existing free-tier branding rules remain in force after reframing. Retaining clean renders is still needed for reversible caption/music/branding changes.

Older deliveries without recorded message IDs, forwarded messages and ambiguous sends whose API responses were lost cannot be mapped safely; direct users to the dashboard instead. Telegram video delivery may still duplicate after an ambiguous network failure. Supporting every such copy requires a richer delivery-receipt history; this change does not claim that ambiguity is solved.

Validate delivery-receipt fencing and chat binding, source ownership, ancestry/aspect preservation, idempotent charging, unsupported-edit recovery and confirmation replies. Simulated webhooks/provider responses are separate from real Telegram Web and cloud rendering acceptance.
