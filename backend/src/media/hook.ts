import type { Op } from '../types.js';
export function hookOp(text: string): Extract<Op, { op: 'title' }> {
  if (typeof text !== 'string' || text.trim().length < 3 || text.length > 100 || /[\x00-\x1f\x7f]/.test(text)) throw Error('Invalid opening title');
  return { op: 'title', text: text.trim(), durationSec: 3 };
}
