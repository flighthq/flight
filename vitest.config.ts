import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      projects: [
        'packages/animation/timeline',
        'packages/assets',
        'packages/flight',
        'packages/geometry',
        'packages/interaction',
        'packages/materials',
        'packages/render/canvas',
        'packages/render/core',
        'packages/scene/graph/stage',
        'packages/scene/graph/world',
        'packages/types',
        'tests/api',
        'tests/api/browser',
        'tests/integration',
      ],
    },
  }),
);
