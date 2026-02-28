import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../../vitest.config.base.js'; // eslint-disable-line

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'unit:render-canvas',
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
    },
  }),
);
