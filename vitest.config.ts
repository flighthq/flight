import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';
import { ISOLATED_MOCK_TEST_FILES } from './vitest.tiers.js';

// One master config for the fast run: unit tests share a single jsdom environment per
// worker (isolate:false) instead of one environment per file — the full suite's cost is per-file
// environment setup, not test logic, so reuse is a ~15× speedup. Tool-capture is deliberately left
// to the per-package CI lane: its Node environment, browser processes, and serialized e2e contracts
// are incompatible with this shared jsdom fast path. Each package keeps its own vitest.config.ts for
// standalone runs; this config does not recurse into them.
//
// Two tiers, because hermeticity has two prices and only one of them is worth paying suite-wide.
//
// The fast tier is every file that does NOT mock a module: they share the registry, and nothing they
// do can leak, so they get the ~15x speedup for free.
//
// The isolated tier is the files that DO mock modules (`vitest.tiers.ts`). Under a shared registry a
// top-level `vi.mock` registers for the whole worker, so those files previously hand-rolled per-file
// hermeticity with `vi.resetModules()` plus a dynamic re-import inside `beforeAll` — which rebuilds the
// subject's whole transitive graph on every run. That is unbounded work inside a fixed hook deadline:
// wrong on any machine slow enough or cache cold enough, and the source of a flake four agents chased.
// Running those files with `isolate: true` buys the same hermeticity from the platform, with no hook
// and no deadline to exceed. Top-level `vi.mock` is safe there precisely because the registry is not
// shared — the rule is about the registry, not about the API.
//
// The tier list is machine-checked by `npm run mocks:check`, in both directions.
const COMMON_EXCLUDE = [
  '**/.claude/**',
  '**/node_modules/**',
  '**/surfaceWasm.test.ts',
  'packages/tool-capture/src/**/*.test.ts',
];

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
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
      passWithNoTests: true,
      projects: [
        {
          extends: true,
          test: {
            name: 'shared',
            isolate: false,
            include: ['packages/**/src/**/*.test.ts', 'scripts/**/*.test.ts'],
            exclude: [...COMMON_EXCLUDE, ...ISOLATED_MOCK_TEST_FILES],
          },
        },
        {
          extends: true,
          test: {
            name: 'isolated',
            isolate: true,
            include: [...ISOLATED_MOCK_TEST_FILES],
            exclude: [...COMMON_EXCLUDE],
          },
        },
      ],
    },
  }),
);
