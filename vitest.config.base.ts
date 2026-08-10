import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

import { TestRunCoverageReporter } from './scripts/testRunCoverage.js';

const rootDir = __dirname;
const rootTsconfig = path.resolve(rootDir, 'tsconfig.json');

export default defineConfig({
  plugins: [tsconfigPaths({ projects: [rootTsconfig], root: rootDir })],
  test: {
    globals: true,
    setupFiles: [path.resolve(rootDir, 'vitest.setup.ts')],
    exclude: ['**/.claude/**', '**/node_modules/**'],
    // Matched files whose name filter executes zero tests are unconfigured, not clean — this reporter is
    // what fails them. It belongs here rather than only in the root config because every package config
    // merges THIS file and none merges the root, so without it the per-package run that AGENTS.md tells
    // builders to use exits 0 on a filter matching nothing. `passWithNoTests` does NOT cover this case:
    // it governs zero matched FILES, which vitest already fails natively. Measured both ways before
    // moving; the two conditions have two different mechanisms and only this one was missing.
    reporters: ['default', new TestRunCoverageReporter()],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 90,
        lines: 85,
      },
    },
  },
  resolve: {
    dedupe: ['@flighthq/types'],
  },
});
