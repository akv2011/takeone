import { describe, it, expect } from 'vitest';
import { search, parseLinkup } from './index.js';

describe('search (Linkup)', () => {
  it('parseLinkup extracts facts + sources from a sourcedAnswer', () => {
    const r = parseLinkup({
      answer: 'UPI processed 14 billion transactions in a month. It overtook cards years ago. Growth continues.',
      sources: [{ name: 'NPCI', url: 'https://npci.org.in' }, { name: 'RBI', url: 'https://rbi.org.in' }],
    });
    expect(r.facts.length).toBeGreaterThan(0);
    expect(r.sources[0]).toMatchObject({ title: 'NPCI', url: 'https://npci.org.in' });
  });
  it('degrades to empty (no key) so generate still works offline', async () => {
    const prev = process.env.LINKUP_API_KEY; delete process.env.LINKUP_API_KEY;
    const r = await search('anything');
    expect(r.facts).toEqual([]); expect(r.sources).toEqual([]);
    if (prev) process.env.LINKUP_API_KEY = prev;
  });
});
