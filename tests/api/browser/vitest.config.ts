import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'api/browser',
      environment: 'jsdom',
      include: ['**/*.test.ts'],
      sequence: { groupOrder: 2 },
    },
  }),
);
