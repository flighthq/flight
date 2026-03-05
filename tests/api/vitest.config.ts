import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'api',
      environment: 'node',
      // include: ['**/*.test.ts', '!'],
      exclude: ['browser/**/*.test.ts'],
    },
  }),
);
