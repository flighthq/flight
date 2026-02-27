import path from 'path';
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
    resolve: {
      alias: {
        '@flight/assets': path.resolve(__dirname, '../../packages/assets/dist/index.js'),
        '@flight/flight': path.resolve(__dirname, '../../packages/flight/dist/index.js'),
        '@flight/geom': path.resolve(__dirname, '../../packages/geom/dist/index.js'),
        '@flight/interaction': path.resolve(__dirname, '../../packages/interaction/dist/index.js'),
        '@flight/materials': path.resolve(__dirname, '../../packages/materials/dist/index.js'),
        '@flight/render-canvas': path.resolve(__dirname, '../../packages/render-canvas/dist/index.js'),
        '@flight/render-core': path.resolve(__dirname, '../../packages/render-core/dist/index.js'),
        '@flight/stage': path.resolve(__dirname, '../../packages/stage/dist/index.js'),
        '@flight/timeline': path.resolve(__dirname, '../../packages/timeline/dist/index.js'),
        '@flight/types': path.resolve(__dirname, '../../packages/types/dist/index.js'),
        '@flight/world': path.resolve(__dirname, '../../packages/world/dist/index.js'),
      },
    },
  }),
);
