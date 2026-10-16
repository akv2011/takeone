import { expect, test } from 'vitest';
import { scenePlanAtOutput } from './sceneProjection.js';
import type { ScenePlan } from './scenes.js';
const plan = { version: 1, scenes: [
  { startSec: 0, endSec: 3.015, purpose: 'Texture', searchTerms: ['soap'], shotType: 'macro', motion: 'still' },
  { startSec: 3.015, endSec: 6, purpose: 'Use', searchTerms: ['hands'], shotType: 'wide', motion: 'pan' },
], brief: {} } as ScenePlan;
test('projects only declared scene metadata on the encoder frame grid', () => {
  const result = scenePlanAtOutput(plan, []);
  expect(result.scenes[0].endSec).toBe(91 / 30); expect(result.scenes[1].startSec).toBe(91 / 30);
  expect(result.durationSec).toBe(6); expect(result).not.toHaveProperty('brief');
});
test('maps ordered trims and speed to the exported timeline without mutating the plan', () => {
  const result = scenePlanAtOutput(plan, [{ op: 'trim', start: '1', end: '5' }, { op: 'speed', factor: 2 }]);
  expect(result.durationSec).toBe(2); expect(result.scenes[0].startSec).toBe(0);
  expect(result.scenes[0].endSec).toBe((91 / 30 - 1) / 2); expect(result.scenes[1].endSec).toBe(2);
  expect(plan.scenes[0].startSec).toBe(0);
});
test('removes fully trimmed scenes and clamps short output', () => {
  const result = scenePlanAtOutput(plan, [{ op: 'clip', start: '4', end: '4.5' }]);
  expect(result.scenes).toHaveLength(1); expect(result.scenes[0]).toMatchObject({ startSec: 0, endSec: 0.5, purpose: 'Use' });
});
test('rejects empty or oversized final timelines', () => {
  expect(() => scenePlanAtOutput(plan, [{ op: 'trim', start: '10', end: '20' }])).toThrow('limits');
  expect(() => scenePlanAtOutput(plan, [{ op: 'speed', factor: 0.1 }])).toThrow('Speed');
});
