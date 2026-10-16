declare const process: { env: Record<string, string | undefined> };
import { internalActionGeneric as internalAction } from "convex/server";
import { v } from "convex/values";

// Sends the "you're on the waitlist" email via Resend. Scheduled by waitlist.join.
// Activates when RESEND_API_KEY is set (npx convex env set RESEND_API_KEY re_...).
export const sendWelcome = internalAction({
  args: { email: v.string(), position: v.number() },
  handler: async (_ctx: any, args: any) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) { console.log(`[email] RESEND_API_KEY not set, skipping welcome to ${args.email}`); return; }
    const from = process.env.WAITLIST_FROM ?? "TakeOne <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [args.email],
        subject: "You're on the TakeOne list",
        html: welcomeHtml(),
      }),
    });
    if (!res.ok) console.log(`[email] resend error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    else console.log(`[email] welcome sent to ${args.email}`);
  },
});

function welcomeHtml(): string {
  return `<!doctype html><html><body style="margin:0;background:#EEF0F3;font-family:'Atkinson Hyperlegible Next',-apple-system,'Segoe UI',Arial,sans-serif;color:#1A1F36">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <img src="https://takeone.web.app/waitlist-welcome.png" alt="TakeOne. Make your first short. 3 videos free, no card needed." width="600" height="300" style="width:100%;max-width:600px;height:auto;border-radius:10px;display:block;margin:0 0 24px" />
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px">Thanks for joining the TakeOne list.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px">Sign in at <a href="https://takeone.web.app/create" style="color:#1A1F36;font-weight:700">takeone.web.app/create</a> to make your first short. Upload a video, paste a link to a long one, or write a prompt, and you get back a 9:16 cut with captions. Your first 3 videos are free.</p>
    <p style="font-size:13px;line-height:1.5;color:#5B6175;margin:24px 0 0">You received this because you joined the TakeOne list. If that was not you, ignore this email.</p>
  </div></body></html>`;
}
