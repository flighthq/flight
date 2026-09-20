import { defineConfig, mergeConfig } from 'vitest/config';

import { UNIT_TEST_LANE_EXCLUDE, UNIT_TEST_LANE_INCLUDE } from './scripts/unitTestLane.js';
import baseConfig from './vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      hookTimeout: 60_000,
      unstubGlobals: true,
      passWithNoTests: false,
      isolate: false,
      include: [...UNIT_TEST_LANE_INCLUDE],
      exclude: [...UNIT_TEST_LANE_EXCLUDE],
    },
  }),
);
