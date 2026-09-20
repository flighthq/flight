import { defineConfig, mergeConfig } from 'vitest/config';

import { REGISTRY_ISOLATED_TEST_FILES } from './scripts/registryIsolatedTests.js';
import { UNIT_TEST_LANE_EXCLUDE, UNIT_TEST_LANE_INCLUDE } from './scripts/unitTestLane.js';
import baseConfig from './vitest.config.base.js';

const COMMON_EXCLUDE = ['**/.claude/**', '**/node_modules/**'];
const TOOL_CAPTURE_TEST_FILES = ['packages/tool-capture/src/**/*.test.ts'];
const TOOL_CAPTURE_E2E_TEST_FILES = ['packages/tool-capture/src/**/*.e2e.test.ts'];

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      hookTimeout: 60_000,
      unstubGlobals: true,
      passWithNoTests: false,
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            isolate: false,
            include: [...UNIT_TEST_LANE_INCLUDE],
            exclude: [...UNIT_TEST_LANE_EXCLUDE],
            sequence: { groupOrder: 0 },
          },
        },
        {
          extends: true,
          test: {
            name: 'isolated',
            isolate: true,
            include: [...REGISTRY_ISOLATED_TEST_FILES],
            exclude: [...COMMON_EXCLUDE, ...TOOL_CAPTURE_TEST_FILES],
            sequence: { groupOrder: 0 },
          },
        },
        {
          extends: true,
          test: {
            name: 'tool-capture',
            environment: 'node',
            fileParallelism: false,
            isolate: true,
            include: [...TOOL_CAPTURE_TEST_FILES],
            exclude: [...COMMON_EXCLUDE, ...TOOL_CAPTURE_E2E_TEST_FILES],
            sequence: { groupOrder: 1 },
          },
        },
      ],
    },
  }),
);
