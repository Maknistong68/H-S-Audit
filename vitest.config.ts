import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __HS_FAKE__: false },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
});
