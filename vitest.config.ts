import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

// One master config for the full run: every package's tests share a single jsdom environment per
// worker (isolate:false) instead of one environment per file — the full suite's cost is per-file
// environment setup, not test logic, so reuse is a ~15× speedup. Each package keeps its own
// vitest.config.ts for standalone runs; this config does not recurse into them.
//
// Every test file is hermetic under a shared module registry: mocks are scoped per-file (vi.doMock
// + dynamic import of the subject, unmocked in afterAll — never top-level hoisted vi.mock, which
// leaks across files) and globals are restored via unstubGlobals. That lets the whole suite run as
// one non-isolated group, with no isolated exception list — so this is a single flat project, not a
// `projects` array.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      isolate: false,
      unstubGlobals: true,
      include: ['packages/**/src/**/*.test.ts'],
      exclude: ['**/.claude/**', '**/node_modules/**', '**/surfaceWasm.test.ts'],
      passWithNoTests: true,
    },
  }),
);
