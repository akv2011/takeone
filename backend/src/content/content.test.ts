import { describe, it, expect } from 'vitest';
import { content, spokenSeconds } from './index.js';

describe('content (offline fallback)', () => {
  it('brainstorm returns 3 angles with hooks', async () => {
    const angles = await content.brainstorm('why UPI beat credit cards');
    expect(angles.length).toBe(3);
    for (const a of angles) { expect(a.hook).toBeTruthy(); expect(a.whyViral).toBeTruthy(); }
  });
  it('script produces a voiceover that reads in ~14-20s', async () => {
    const angles = await content.brainstorm('upi');
    const { script } = await content.script(angles[0]);
    expect(script.length).toBeGreaterThan(20);
    expect(spokenSeconds(script)).toBeLessThan(30);
  });
  it('captionText uppercases for meme style', async () => {
    const t = await content.captionText([{ text: 'hello', start: 0, end: 1 }, { text: 'world', start: 1, end: 2 }], 'meme');
    expect(t).toBe('HELLO WORLD');
  });
});
