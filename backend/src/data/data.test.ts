import { describe, it, expect } from 'vitest';
import { data, handleDodoWebhook, checkoutUrl } from './index.js';

describe('data + payments', () => {
  it('tracks per-day usage', async () => {
    expect(await data.freeUsedToday('d1', '2026-07-12')).toBe(0);
    await data.incUsage('d1', '2026-07-12'); await data.incUsage('d1', '2026-07-12');
    expect(await data.freeUsedToday('d1', '2026-07-12')).toBe(2);
    expect(await data.freeUsedToday('d1', '2026-07-13')).toBe(0);
  });
  it('setPro / isPro', async () => {
    expect(await data.isPro('p1')).toBe(false);
    await data.setPro('p1'); expect(await data.isPro('p1')).toBe(true);
  });
  it('dodo webhook flips the user to pro', async () => {
    const r = await handleDodoWebhook({ event: 'payment.succeeded', metadata: { userId: 'w1' } });
    expect(r.ok).toBe(true); expect(await data.isPro('w1')).toBe(true);
  });
  it('checkoutUrl carries the userId', () => {
    expect(checkoutUrl('u42')).toContain('u42');
  });
  it('createJob records a row', async () => {
    await data.createJob({ id: 'j9', userId: 'u1', platform: 'cli', mode: 'edit', source: { kind: 'none' }, ops: [], isPro: false, limits: { maxBytes: 1, maxDurationSec: 1, timeoutSec: 1 } });
    expect(data._jobs.find((j) => j.id === 'j9')).toBeTruthy();
  });
});
