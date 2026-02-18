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
      setupFiles: [], // avoid global test setup
    },
    resolve: {
      alias: {
        '@flight/filters': path.resolve(__dirname, '../../packages/filters/dist/index.js'),
        '@flight/flight': path.resolve(__dirname, '../../packages/flight/dist/index.js'),
        '@flight/interaction': path.resolve(__dirname, '../../packages/interaction/dist/index.js'),
        '@flight/math': path.resolve(__dirname, '../../packages/math/dist/index.js'),
        '@flight/render': path.resolve(__dirname, '../../packages/render/dist/index.js'),
        '@flight/stage': path.resolve(__dirname, '../../packages/stage/dist/index.js'),
        '@flight/types': path.resolve(__dirname, '../../packages/types/dist/index.js'),
      },
    },
  }),
);
