// B5 — persistence + payments. In-memory by default (works offline / for the demo); the Convex
// schema + functions live in convex/ for the deployed version. Dodo webhook flips isPro.
import type { JobSpec } from '../types.js';

interface JobRow { id: string; userId: string; mode: string; status: string; isPro: boolean; at: number; }
const proUsers = new Set<string>();
const usageByDay = new Map<string, number>();   // key: `${userId}:${yyyy-mm-dd}`
const jobs: JobRow[] = [];

function dayKey(userId: string, day: string) { return `${userId}:${day}`; }
// day is injected (Date.now is unavailable in some sandboxes; caller passes it or we use a fixed bucket)
function today(): string { try { return new Date().toISOString().slice(0, 10); } catch { return 'na'; } }

export const data = {
  async isPro(userId: string) { return proUsers.has(userId); },
  async setPro(userId: string) { proUsers.add(userId); },
  async incUsage(userId: string, day = today()) {
    const k = dayKey(userId, day); const n = (usageByDay.get(k) ?? 0) + 1; usageByDay.set(k, n); return n;
  },
  async freeUsedToday(userId: string, day = today()) { return usageByDay.get(dayKey(userId, day)) ?? 0; },
  async createJob(job: JobSpec) { jobs.push({ id: job.id, userId: job.userId, mode: job.mode, status: 'queued', isPro: job.isPro, at: 0 }); return job.id; },
  async setStatus(id: string, status: string) { const j = jobs.find((x) => x.id === id); if (j) j.status = status; },
  _jobs: jobs,
};

// Dodo payment webhook -> mark the user Pro. Verify signature in production (DODO_WEBHOOK_SECRET).
export async function handleDodoWebhook(payload: { event: string; userId?: string; metadata?: { userId?: string } }) {
  const uid = payload.userId ?? payload.metadata?.userId;
  if ((payload.event === 'payment.succeeded' || payload.event === 'checkout.completed') && uid) {
    await data.setPro(uid);
    return { ok: true, pro: uid };
  }
  return { ok: false };
}

// Dodo checkout link for the ₹99 unlock (metadata carries the userId so the webhook knows who to upgrade).
export function checkoutUrl(userId: string): string {
  const base = process.env.DODO_CHECKOUT_URL ?? 'https://checkout.dodopayments.com/takeone-pro';
  return `${base}?metadata[userId]=${encodeURIComponent(userId)}`;
}
