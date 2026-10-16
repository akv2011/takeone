// @vitest-environment node
import { expect, test } from 'vitest';
// @ts-expect-error standalone operator script has no declaration file
import { summarize } from '../scripts/summarize-latency.mjs';
test('report excludes failures from percentiles and deduplicates exact exported records', () => {
  const good = { event: 'takeone.stage', stage: 'render', success: true, durationMs: 100, runId: 'a' };
  const report = summarize([good, good, { ...good, durationMs: 900, runId: 'b' }, { ...good, success: false, durationMs: 1, runId: 'c' }]);
  expect(report.stages.render).toEqual({ successfulSamples: 2, failedSamples: 1, p50Ms: 100, p95Ms: 900, maxMs: 900 });
});
test('report reads Cloud Logging formats and preserves uncertain outcomes', () => {
  const report = summarize([
    { jsonPayload: { event: 'takeone.queue_wait', durationMs: 200, jobId: 'job' } },
    { textPayload: JSON.stringify({ event: 'takeone.outcome', outcome: 'finalize_uncertain' }) },
    { jsonPayload: { event: 'takeone.stage', stage: 'upload', durationMs: -1 } }, null,
  ]);
  expect(report.stages.initial_queue_wait.p95Ms).toBe(200);
  expect(report.outcomes.finalize_uncertain).toBe(1);
  expect(report.ignoredRecords).toBe(2);
});

test('Telegram reports distinguish attempt failures from total successful acceptance time', () => {
 const report = summarize([
  { event: 'takeone.stage', stage: 'telegram_api_delivery', success: false, durationMs: 30000, attempt: 1 },
  { event: 'takeone.stage', stage: 'telegram_api_delivery', success: true, durationMs: 2000, attempt: 2 },
  { event: 'takeone.stage', stage: 'telegram_total', success: true, durationMs: 120000 },
 ]);
 expect(report.stages.telegram_api_delivery).toMatchObject({ successfulSamples: 1, failedSamples: 1, p95Ms: 2000 });
 expect(report.stages.telegram_total.p95Ms).toBe(120000);
 expect(report.scope).toContain('not device receipt');
});
