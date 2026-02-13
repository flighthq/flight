import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      projects: [
        'packages/filters',
        'packages/flight',
        'packages/math',
        'packages/render',
        'packages/scene',
        'packages/stage',
        'packages/types',
      ],
    },
  }),
);
