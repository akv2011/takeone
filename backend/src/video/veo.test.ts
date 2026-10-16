import { expect, test, vi } from 'vitest';
import { generateScene, type VeoDeps } from './veo.js';
const config = { project: 'test-project', region: 'us-central1', model: 'veo-3.0-generate-001', bucket: 'test-bucket' };
const operation = 'projects/test-project/locations/us-central1/publishers/google/models/veo-3.0-generate-001/operations/operation1';
const request = { jobId: 'job1', prompt: 'A cinematic mountain sunrise', aspect: '9:16' as const };
const done = { done: true, response: { videos: [{ gcsUri: 'gs://test-bucket/ai/job1/result/sample_0.mp4', mimeType: 'video/mp4' }] } };
function deps(patch: Partial<VeoDeps> = {}): VeoDeps {
  return { begin: vi.fn(async () => true), save: vi.fn(async () => {}), wait: vi.fn(async () => {}), post: vi.fn().mockResolvedValueOnce({ name: operation }).mockResolvedValueOnce({ done: false }).mockResolvedValue(done), ...patch };
}
test('creates one scene, saves operation before polling, and returns only its owned bucket key', async () => {
  const d = deps();
  expect(await generateScene(config, request, d, new AbortController().signal)).toBe('ai/job1/result/sample_0.mp4');
  expect(d.save).toHaveBeenCalledWith(operation);
  expect(d.post).toHaveBeenNthCalledWith(1, expect.stringContaining(':predictLongRunning'), expect.objectContaining({ parameters: expect.objectContaining({ sampleCount: 1, durationSeconds: 8, generateAudio: true }) }), expect.any(AbortSignal));
  expect(d.post).toHaveBeenCalledTimes(3);
});
test('retry resumes the durable operation and does not buy another generation', async () => {
  const d = deps({ post: vi.fn(async () => done) });
  await generateScene(config, { ...request, operation }, d, new AbortController().signal);
  expect(d.begin).not.toHaveBeenCalled(); expect(d.save).not.toHaveBeenCalled();
  expect(d.post).toHaveBeenCalledWith(expect.stringContaining(':fetchPredictOperation'), { operationName: operation }, expect.any(AbortSignal));
});
test('ambiguous creation latch blocks duplicate provider calls', async () => {
  const d = deps({ begin: vi.fn(async () => false) });
  await expect(generateScene(config, request, d, new AbortController().signal)).rejects.toThrow('reconciliation');
  expect(d.post).not.toHaveBeenCalled();
});
test.each([
  { done: true, response: { videos: [] } },
  { error: { code: 403, message: 'policy filter' } },
  { done: true, response: { videos: [{ gcsUri: 'gs://foreign-bucket/ai/job1/out.mp4', mimeType: 'video/mp4' }] } },
  { done: true, response: { videos: [{ gcsUri: 'gs://test-bucket/ai/other/out.mp4', mimeType: 'video/mp4' }] } },
])('provider failures/foreign results never become completed artifacts', async response => {
  const d = deps({ post: vi.fn(async () => response) });
  await expect(generateScene(config, { ...request, operation }, d, new AbortController().signal)).rejects.toThrow();
});
test('abort prevents even starting a provider call', async () => {
  const d = deps(), controller = new AbortController(); controller.abort();
  await expect(generateScene(config, request, d, controller.signal)).rejects.toThrow();
  expect(d.begin).not.toHaveBeenCalled();
});
