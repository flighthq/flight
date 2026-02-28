import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'api:node',
      environment: 'node',
      include: ['**/*.test.ts', '!browser/**/*.test.ts'],
    },
  }),
);
