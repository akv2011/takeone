import { describe, it, expect } from 'vitest';
import { searchFacts, parseFacts } from './index.js';

describe('searchFacts', () => {
  it('reads one fact per line and drops list markers, fragments and extra lines', () => {
    const answer = [
      '1. UPI processed 14 billion transactions in a single month.',
      '- It overtook card payments in India several years ago.',
      'Short.',
      '',
      ...Array.from({ length: 6 }, (_, i) => `* Extra fact number ${i} about digital payments.`),
    ].join('\n');
    const facts = parseFacts(answer);
    expect(facts).toHaveLength(6);
    expect(facts.slice(0, 2)).toEqual([
      'UPI processed 14 billion transactions in a single month.',
      'It overtook card payments in India several years ago.',
    ]);
  });
  it('returns no facts without Gemini configured, so generate still works offline', async () => {
    const prev = process.env.GEMINI_MODEL; delete process.env.GEMINI_MODEL;
    try { expect(await searchFacts('anything')).toEqual([]); }
    finally { if (prev) process.env.GEMINI_MODEL = prev; }
  });
});
