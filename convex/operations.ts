import { internalQueryGeneric as query, internalActionGeneric as action, makeFunctionReference as ref } from 'convex/server';
import { productCapabilities } from './capabilities';
declare const process: { env: Record<string, string | undefined> };

export const QUEUE_WARNING_MS = 5 * 60_000;

/** Bounded condition probes, not counts, uptime checks or provider readiness. */
export const snapshot = query({ args: {}, handler: async ctx => {
  const now = Date.now();
  const queued = await ctx.db.query('genJobs').withIndex('by_status_created', q => q.eq('status', 'queued')).first();
  const expired = await Promise.all(['dispatched', 'processing'].map(status =>
    ctx.db.query('genJobs').withIndex('by_status_lease', (q: any) => q.eq('status', status).lte('leaseExpiresAt', now)).first()));
  const failedVideo = await ctx.db.query('genJobs').withIndex('by_delivery', q => q.eq('telegramDeliveryStatus', 'failed')).first();
  const failedText = await ctx.db.query('telegramMessages').withIndex('by_status_next', q => q.eq('status', 'failed')).first();
  const oldestQueueWaitMs = queued ? Math.max(0, now - queued.createdAt) : null;
  const issues: string[] = [];
  if (oldestQueueWaitMs !== null && oldestQueueWaitMs > QUEUE_WARNING_MS) issues.push('QUEUE_WAIT_HIGH');
  if (expired.some(Boolean)) issues.push('WORKER_LEASE_EXPIRED');
  if (failedVideo) issues.push('TELEGRAM_VIDEO_FAILED');
  if (failedText) issues.push('TELEGRAM_TEXT_FAILED');
  return { observedAt: now, oldestQueueWaitMs, expiredWorkerLease: expired.some(Boolean),
    failedTelegramVideo: Boolean(failedVideo), failedTelegramText: Boolean(failedText), issues };
}});

export const logHealth = action({ args: {}, handler: async ctx => {
  const health = await ctx.runQuery(ref<'query'>('operations:snapshot'), {});
  console.info(JSON.stringify({ event: 'takeone.operations', ...health }));
}});

export const launchReadiness = query({ args: {}, handler: async ctx => {
  const capabilities = productCapabilities(process.env);
  // Target legacy jobs directly so managed jobs cannot hide them beyond a sample.
  const legacy = (await Promise.all(['queued', 'dispatched', 'processing'].map(status =>
    ctx.db.query('genJobs').withIndex('by_status_reservation', (q: any) => q.eq('status', status).eq('reservation', undefined)).take(101)
  ))).flat();
  const missing = Object.entries(capabilities).filter(([, value]) => !value.available).map(([name]) => name);
  return {
    observedAt: Date.now(),
    ready: missing.length === 0 && legacy.length === 0,
    missing,
    activeLegacyJobs: Math.min(legacy.length, 100),
    legacyJobsTruncated: legacy.length > 100,
    configuredProject: process.env.GCP_PROJECT?.trim() || null,
    applicationUrlConfigured: Boolean(process.env.APP_URL?.trim()),
  };
}});
