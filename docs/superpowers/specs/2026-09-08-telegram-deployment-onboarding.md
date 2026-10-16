# Deployment-specific Telegram onboarding

Use TELEGRAM_BOT_USERNAME plus token, webhook secret and HTTPS APP_URL as the deployment's explicit bot configuration. Do not create link codes or accept generation requests without that configuration. Dashboard status is owner-scoped and reports linked/configured state without exposing Telegram IDs or codes. Link instructions use the returned bot username; hide the code after successful linking. Disconnect shares the submission lock and reports errors. Bot onboarding/pricing URLs derive from APP_URL origin, preventing staging-to-production redirects.

Before staging acceptance, verify the username matches Telegram getMe for the configured token and register the webhook on the matching Convex deployment. Tests exercise missing configuration without DB mutation, linked-state UI/code hiding, disabled controls and staging-origin links. Real cloud-computer testing remains separate.
