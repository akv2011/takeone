declare const process: { env: Record<string, string | undefined> };
import { internalActionGeneric as internalAction } from "convex/server";
import { v } from "convex/values";

// Sends the "you're on the waitlist" email via Resend. Scheduled by waitlist.join.
// Activates when RESEND_API_KEY is set (npx convex env set RESEND_API_KEY re_...).
export const sendWelcome = internalAction({
  args: { email: v.string(), position: v.number() },
  handler: async (_ctx: any, args: any) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) { console.log(`[email] RESEND_API_KEY not set — skipping welcome to ${args.email}`); return; }
    const from = process.env.WAITLIST_FROM ?? "TakeOne <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [args.email],
        subject: "You're on the TakeOne waitlist 🎬",
        html: welcomeHtml(),
      }),
    });
    if (!res.ok) console.log(`[email] resend error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    else console.log(`[email] welcome sent to ${args.email}`);
  },
});

function welcomeHtml(): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:#141220">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <img src="https://takeone.web.app/waitlist-welcome.png" alt="You're on the TakeOne waitlist — welcome to the Founding Creators" width="600" style="width:100%;max-width:600px;height:auto;border-radius:16px;display:block;margin:0 0 20px" />
    <p style="font-size:15px;line-height:1.6;color:#4a4857;margin:0 0 8px;text-align:center">🎉 Congratulations — you're on the list. We'll email you the moment early access opens.</p>
    <p style="font-size:12px;color:#9d98b8;margin:20px 0 0;text-align:center">You received this because you joined the TakeOne waitlist. If that wasn't you, ignore this email.</p>
  </div></body></html>`;
}
