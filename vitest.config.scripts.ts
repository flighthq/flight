import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      hookTimeout: 60_000,
      passWithNoTests: false,
      include: ['scripts/**/*.test.ts'],
      exclude: ['**/.claude/**', '**/node_modules/**'],
    },
  }),
);
