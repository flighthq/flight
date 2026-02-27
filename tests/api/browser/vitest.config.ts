import path from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../../vitest.config.base.js'; // eslint-disable-line

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'api:browser',
      environment: 'jsdom',
      include: ['**/*.test.ts'],
    },
  }),
);
