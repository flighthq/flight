import path from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    // Pinned so this config is self-contained: the size test runs on its own (npm run test:size),
    // no longer as a project of the master vitest.config.ts. Without an explicit root, `**/*.test.ts`
    // would glob the whole repo when invoked via --config from the repo root.
    root: path.resolve(__dirname),
    test: {
      name: 'size',
      environment: 'node',
      include: ['**/*.test.ts'],
      testTimeout: 300000, // 5 minutes for full builds + gzip
    },
  }),
);
