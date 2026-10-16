import { defineConfig } from 'vitest/config';
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: { setupFiles: ['tests/render-environment.ts'], maxWorkers: 2, environment: 'edge-runtime', include: ['tests/**/*.test.{ts,tsx}'], server: { deps: { inline: ['convex-test'] } } },
});
