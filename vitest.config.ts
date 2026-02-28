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
        'packages/events/input',
        'packages/materials',
        'packages/render/canvas',
        'packages/render/core',
        'packages/scene/graph/stage',
        'packages/animation/timeline',
        'packages/types',
        'packages/scene/graph/world',
        'tests/integration',
        'tests/api',
        'tests/api/browser',
      ],
    },
  }),
);
