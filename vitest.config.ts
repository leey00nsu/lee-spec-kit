import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15_000,
    // CLI integration tests spawn the shared built dist bundle, so file-level
    // parallelism adds avoidable flakiness around subprocess startup.
    fileParallelism: false,
    include: ['tests/**/*.test.*', 'src/__tests__/**/*.test.*'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/tmp/**',
      'tmp/**',
    ],
  },
});
