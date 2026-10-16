import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import capturedSoapPlan from './fixtures/soap-scene-plan.json';
import capturedStringQueryPlan from './fixtures/soap-scene-plan-string-query.json';
import { planStockScenes, validateScenePlan, type ScenePlan } from './scenes.js';
export const soapPlan = (): ScenePlan => ({ version: 1, brief: { audience: 'natural skincare buyers', promise: 'a daily soap ritual', visualNouns: ['soap', 'foam'], setting: 'bathroom', lighting: 'soft daylight', cameraMotion: 'slow push', pacing: 'calm', restrictedTerms: ['cars'] }, scenes: [
  { startSec: 0, endSec: 3, purpose: 'Introduce texture', searchTerms: ['soap foam macro'], shotType: 'macro', motion: 'slow push' },
  { startSec: 3, endSec: 6, purpose: 'Show daily use', searchTerms: ['hands washing soap'], shotType: 'close-up', motion: 'static' },
] });
beforeEach(() => { vi.stubEnv('LLM_API_KEY', 'test'); vi.stubEnv('LLM_MODEL', 'configured'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
test.each(['Natural beauty soap for sensitive skin', 'Founder building a SaaS product with a small team'])('uses the complete creator direction and narration: %s', async topic => {
  const plan = soapPlan();
  if (topic.startsWith('Founder')) {
    plan.brief.visualNouns = ['laptop', 'whiteboard'];
    plan.scenes[0].searchTerms = ['founder laptop office'];
    plan.scenes[1].searchTerms = ['startup team whiteboard'];
  }
  const fetcher = vi.fn().mockResolvedValue(response(plan)); vi.stubGlobal('fetch', fetcher);
  expect(await planStockScenes(topic, 'A concrete narrated story for the intended audience.', 6)).toEqual(plan);
  const request = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(request.messages[1].content).toContain(topic);
  expect(request.messages[1].content).toContain('A concrete narrated story');
  expect(request.model).toBe('configured');
});
test.each([
  (p: ScenePlan) => { p.scenes[1].startSec = 4; },
  (p: ScenePlan) => { p.scenes[1].startSec = 3.0005; },
  (p: ScenePlan) => { p.brief.audience = 'bad\nline'; },
  (p: ScenePlan) => { p.scenes[0].startSec = -1; },
  (p: ScenePlan) => { p.scenes[1].endSec = 7; },
  (p: ScenePlan) => { p.scenes[1].endSec = NaN; },
  (p: ScenePlan) => { p.scenes[1].searchTerms = ['SOAP   foam macro']; },
  (p: ScenePlan) => { p.scenes[1].searchTerms = ['sports cars']; },
  (p: ScenePlan) => { p.scenes[1].searchTerms = []; },
  (p: ScenePlan) => { p.brief.visualNouns = []; },
  (p: ScenePlan) => { p.brief.audience = ''; },
  (p: ScenePlan) => { p.scenes[0].motion = 'x'.repeat(121); },
])('rejects invalid brief, bounds, gaps, repeated or restricted queries %#', mutate => {
  const plan = soapPlan(); mutate(plan);
  expect(() => validateScenePlan(plan, 6)).toThrow('invalid creative plan');
});
test.each([null, {}, { scenes: [] }])('rejects malformed model results without a fallback %j', async value => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
  await expect(planStockScenes('soap', 'Narration.', 6)).rejects.toThrow('invalid creative plan');
});
test('rejects non JSON model text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Here is your plan' } }] }))));
  await expect(planStockScenes('soap', 'Narration.', 6)).rejects.toThrow('invalid JSON');
});
test('requires provider configuration even when the caller omits strict', async () => {
  vi.stubEnv('LLM_MODEL', '');
  await expect(planStockScenes('soap', 'Narration.', 6)).rejects.toThrow('LLM_MODEL');
});
test('propagates lease cancellation during planning', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('transport cancelled'))))));
  const pending = planStockScenes('soap', 'Narration.', 6, { signal: controller.signal });
  controller.abort(Error('lease lost'));
  await expect(pending).rejects.toThrow('lease lost');
});

test('supports the worker’s complete 300 second duration with bounded scenes', () => {
  const plan = soapPlan();
  plan.scenes = Array.from({ length: 10 }, (_, index) => ({ ...plan.scenes[0], startSec: index * 30, endSec: (index + 1) * 30, searchTerms: [`soap shot ${index}`] }));
  expect(validateScenePlan(plan, 300).scenes).toHaveLength(10);
});

test('accepts the captured live soap plan without truncating long search phrases', () => {
  expect(capturedSoapPlan.scenes.some(scene => scene.searchTerms[0].length > 60)).toBe(true);
  expect(validateScenePlan(capturedSoapPlan, 20).scenes.map(scene => scene.searchTerms)).toEqual(capturedSoapPlan.scenes.map(scene => scene.searchTerms));
});
test('bounds the complete joined query regardless of model phrase segmentation', () => {
  const plan = soapPlan();
  plan.scenes[0].searchTerms = ['a'.repeat(120), 'b'.repeat(120)];
  expect(() => validateScenePlan(plan, 6)).toThrow('invalid creative plan');
  plan.scenes[0].searchTerms = ['a'.repeat(240)];
  expect(validateScenePlan(plan, 6).scenes[0].searchTerms[0]).toHaveLength(240);
});
test('normalizes query whitespace while preserving every word', () => {
  const plan = soapPlan();
  plan.scenes[0].searchTerms = ['  soap  foam ', ' macro  '];
  expect(validateScenePlan(plan, 6).scenes[0].searchTerms).toEqual(['soap foam', 'macro']);
});

test('canonicalizes the captured live single-string query without weakening its limits', () => {
  expect(typeof capturedStringQueryPlan.scenes[0].searchTerms).toBe('string');
  const accepted = validateScenePlan(capturedStringQueryPlan, 20);
  expect(accepted.scenes.map(scene => scene.searchTerms)).toEqual(capturedStringQueryPlan.scenes.map(scene => [scene.searchTerms]));
  expect(() => validateScenePlan({ ...capturedStringQueryPlan, scenes: capturedStringQueryPlan.scenes.map(scene => ({ ...scene, searchTerms: 'x'.repeat(241) })) }, 20)).toThrow('invalid creative plan');
});
