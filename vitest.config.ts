import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

// One master config for the fast run: unit tests share a single jsdom environment per
// worker (isolate:false) instead of one environment per file — the full suite's cost is per-file
// environment setup, not test logic, so reuse is a ~15× speedup. Tool-capture is deliberately left
// to the per-package CI lane: its Node environment, browser processes, and serialized e2e contracts
// are incompatible with this shared jsdom fast path. Each package keeps its own vitest.config.ts for
// standalone runs; this config does not recurse into them.
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
      // The per-file mock idiom above has a cost the default 10s hook budget does not cover under load.
      // `vi.resetModules()` plus a dynamic re-import rebuilds the subject's whole transitive graph, and
      // for the widest subjects (the @flighthq/scene3d-resources loaders) that measured 2-4s per file
      // on an *idle* machine — bisected with --hookTimeout. Sixteen workers competing for CPU is enough
      // to push that past 10s, which surfaced as a setup failure with zero test failures, on a
      // different subset of files each run. Raising the budget is the right lever rather than trimming
      // the hook: the reset-and-re-import is what makes each file hermetic under `isolate: false`, so
      // the cost is buying the shared-registry speedup, not waste.
      hookTimeout: 60_000,
      unstubGlobals: true,
      include: ['packages/**/src/**/*.test.ts', 'scripts/**/*.test.ts'],
      exclude: [
        '**/.claude/**',
        '**/node_modules/**',
        '**/surfaceWasm.test.ts',
        'packages/tool-capture/src/**/*.test.ts',
      ],
      passWithNoTests: true,
    },
  }),
);
