import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'size',
      environment: 'node',
      include: ['**/*.test.ts'],
      sequence: { groupOrder: -1 },
    },
  }),
);
