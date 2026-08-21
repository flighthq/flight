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
      // ★ THE THRESHOLDS GOVERN THE SHIPPED SDK, SO THE MEASUREMENT HAS TO NAME IT.
      // Left unscoped, this counted every module a test happened to load: the three `host-*` backends, the
      // `tool-*` dev/CI suite, the repo's own build scripts and fixtures. AGENTS.md already places the first
      // two deliberately outside the `@flighthq/sdk` barrel and `scripts/sdk-policy.ts` enforces it, so the
      // threshold was being judged against a population the project defines as out of scope — and the repo
      // scripts are not product code at all.
      //
      // Measured on this tree before the change: whole-tree functions 87.60% against a 90 threshold, FAILING,
      // while the SDK alone stood at 93.03%. Of 1673 uncovered functions, 900 were host backends (422), repo
      // scripts (254), tool-capture (189) and fixtures (35). The failing number described the tooling.
      //
      // Two families are excluded rather than the whole of `packages/`, because everything else here IS the
      // product. Scoping raises all four metrics and drops none below its bar (lines 88.39->91.71, statements
      // 86.59->90.09, functions 87.60->93.03, branches 78.79->82.26), so nothing was being propped up by the
      // code this removes.
      //
      // WHAT THIS DOES NOT FIX, and do not read a green here as covering it: the functional suite and
      // tool-capture's browser contracts run in a browser this leg has none for, so code they exercise still
      // reads as uncovered. `effects-gl` and `effects-wgpu` sit near 60% for exactly that reason. The remedy
      // is folding those legs into coverage, never unit tests written to duplicate what they already prove.
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/host-*/**', 'packages/tool-*/**', '**/*.test.ts', '**/*.e2e.test.ts'],
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
