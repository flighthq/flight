import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'unit:animation-timeline',
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
    },
  }),
);
