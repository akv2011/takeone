import { beforeEach, vi } from 'vitest';

// Existing render tests exercise a configured deployment. Tests for missing
// configuration override individual fields explicitly; production has no defaults.
beforeEach(() => {
  vi.stubEnv('DISPATCH_URL', 'https://dispatcher.example');
  vi.stubEnv('DISPATCH_SECRET', 'test-dispatch-secret');
  vi.stubEnv('WORKER_SECRET', 'test-secret');
  vi.stubEnv('STOCK_VIDEO_ENABLED', 'true');
  vi.stubEnv('YOUTUBE_INGEST_ENABLED', 'true');
});
