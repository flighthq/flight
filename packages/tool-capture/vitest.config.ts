import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      // Both browser contract files launch Chromium and exercise the same host GPU/SwiftShader
      // resources. Running them in separate workers adds contention without testing isolation and has
      // produced valid WebGL contexts whose one-shot framebuffers read back empty in CI.
      fileParallelism: false,
      include: ['src/**/*.test.ts'],
    },
  }),
);
