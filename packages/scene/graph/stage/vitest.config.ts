import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../../../vitest.config.base.js'; // eslint-disable-line

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'unit:scene-graph-stage',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }),
);
