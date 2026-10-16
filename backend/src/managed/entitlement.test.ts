import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '../gateway/index.js';
import type { JobSpec } from '../types.js';
describe('explicit managed mode, aspect, and reservation entitlement', () => {
 it('ignores topic links as clip intent when generate is explicitly selected', async () => {
   let captured: JobSpec | undefined;
   await handleMessage({ userId: 'u', platform: 'cli', text: 'make a reel about https://youtu.be/abc square', mode: 'generate', aspect: '16:9', isPro: false }, {
     data: { isPro: async () => false, freeUsedToday: async () => 0, incUsage: async () => 0 },
     enqueue: async job => { captured = job; return { ok: true, outputPath: '/out.mp4' }; },
   });
   expect(captured).toMatchObject({ mode: 'generate', isPro: false });
   expect(captured?.ops).toContainEqual({ op: 'format', aspect: '16:9' });
   expect(captured?.ops).toContainEqual(expect.objectContaining({ op: 'watermark', show: true }));
 });
 it('requires an edit source and never silently generates instead', async () => {
   const enqueue = vi.fn();
   const result = await handleMessage({ userId: 'u', platform: 'cli', text: 'caption this please', mode: 'edit', aspect: '9:16', isPro: false }, {
     data: { isPro: async () => false, freeUsedToday: async () => 0, incUsage: async () => 0 }, enqueue,
   });
   expect(result[0]).toMatchObject({ kind: 'text', text: expect.stringContaining('needs a video') }); expect(enqueue).not.toHaveBeenCalled();
 });
});
