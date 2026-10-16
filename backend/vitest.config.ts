import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  // Each media test starts real FFmpeg processes. Bound file-level workers so
  // the regression suite does not turn into an accidental machine load test.
  // Explicit queue/concurrency tests still run their own simultaneous jobs.
  test: { maxWorkers: 2 },
});
