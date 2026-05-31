import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'size',
      environment: 'node',
      include: ['**/*.test.ts'],
      sequence: { groupOrder: 3 },
      testTimeout: 300000, // 5 minutes for full builds + gzip
    },
  }),
);
