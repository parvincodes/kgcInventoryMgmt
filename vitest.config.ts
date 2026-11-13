import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Each file gets its own temp database, so files can run in parallel safely.
    pool: 'forks',
    testTimeout: 20000
  }
});
