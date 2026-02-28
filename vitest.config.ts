import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      projects: [
        'packages/assets',
        'packages/flight',
        'packages/geom',
        'packages/interaction',
        'packages/materials',
        'packages/render/canvas',
        'packages/render/core',
        'packages/stage',
        'packages/timeline',
        'packages/types',
        'packages/world',
        'tests/integration',
        'tests/api',
        'tests/api/browser',
      ],
    },
  }),
);
