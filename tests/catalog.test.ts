import { expect, test } from 'vitest';
import { FREE_LIMIT, PACKS, FOUNDING_CREDITS } from '../convex/config';
test('catalog matches five lifetime free videos and requested one-time packs', () => {
 expect(FREE_LIMIT).toBe(5); expect(FOUNDING_CREDITS).toBe(0);
 expect(PACKS.map(p => [p.amountUsd, p.credits])).toEqual([[9.99,25],[25,100],[99.99,500]]);
});
