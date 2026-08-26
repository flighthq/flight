import { defineConfig, mergeConfig } from 'vitest/config';

import { REGISTRY_ISOLATED_TEST_FILES } from './scripts/registryIsolatedTests.js';
import baseConfig from './vitest.config.base.js';

// One master config for the fast run: unit tests share a single jsdom environment per
// worker (isolate:false) instead of one environment per file — the full suite's cost is per-file
// environment setup, not test logic, so reuse is a ~15× speedup. Each package keeps its own
// vitest.config.ts for standalone runs; this config does not recurse into them.
//
// A package incompatible with the shared jsdom path gets its OWN PROJECT here, not an exclusion.
// Tool-capture needs the node environment and serial files, which is a reason to route it rather than
// to skip it — being outside the `@flighthq/sdk` barrel is a PACKAGING decision and says nothing about
// whether the test gate should cover it. It was excluded once, and the package that decides whether a
// capture drew anything became the one package nothing verified: a fixture there asserted the opposite
// of its own purpose while this run reported zero failures.
//
// Two tiers, because hermeticity has two prices and only one of them is worth paying suite-wide.
//
// The fast tier is every file that does NOT mock a module: they share the registry, and nothing they
// do can leak, so they get the ~15x speedup for free.
//
// The isolated tier is the files that CANNOT SHARE A MODULE REGISTRY (`scripts/registryIsolatedTests.ts`),
// each carrying the reason it needs its own. Under a shared registry a
// top-level `vi.mock` registers for the whole worker, so those files previously hand-rolled per-file
// hermeticity with `vi.resetModules()` plus a dynamic re-import inside `beforeAll` — which rebuilds the
// subject's whole transitive graph on every run. That is unbounded work inside a fixed hook deadline:
// wrong on any machine slow enough or cache cold enough, and the source of a flake four agents chased.
// Running those files with `isolate: true` buys the same hermeticity from the platform, with no hook
// and no deadline to exceed. Top-level `vi.mock` is safe there precisely because the registry is not
// shared — the rule is about the registry, not about the API.
//
// The tier list is machine-checked by `npm run mocks:check`, in both directions.
const COMMON_EXCLUDE = ['**/.claude/**', '**/node_modules/**'];
const TEST_RUN_COVERAGE_FILE = 'scripts/testRunCoverage.test.ts';
// `tool-capture` is ROUTED to its own project rather than excluded from the run. It needs the node
// environment and serial files — its browser contracts launch Chromium against the host GPU, and
// sharing that across workers has produced valid contexts whose framebuffers read back empty — so it
// cannot join the jsdom projects. That is a reason to give it a project, not a reason to skip it: this
// package decides whether a capture drew anything, so a defect here is the one defect nothing else
// catches. It is listed here so the other projects can exclude it by name in one place.
const TOOL_CAPTURE_TEST_FILES = ['packages/tool-capture/src/**/*.test.ts'];

// The browser contracts, split out because this list has two OPPOSITE jobs and only one of them may
// narrow. `TOOL_CAPTURE_TEST_FILES` is the EXCLUDE for the three parallel projects and must stay the
// full set: narrowing it there would stop excluding these two files, and they would be picked up and
// run by the jsdom projects instead — the same browser launch failing in a different place. So the
// full list keeps guarding the other projects, and only the tool-capture project's own include is
// reduced, by excluding these.
//
// They are not skipped. `npm run test:unit` runs each package under its own config, whose include is
// `src/**/*.test.ts`, and that CI leg installs Chromium — so the browser contract is verified where a
// browser exists, while the root run keeps the 25 files that need none. That split is what the
// tool-capture routing was for: the logic a defect would hide in stays covered by something that runs.
const TOOL_CAPTURE_E2E_TEST_FILES = ['packages/tool-capture/src/**/*.e2e.test.ts'];

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
      // Zero matched files fail natively; the zero-executed-tests half of the same fail-loudly doctrine
      // is carried by `TestRunCoverageReporter`, which now lives in the base config so per-package runs
      // get it too. Not repeated here: `mergeConfig` CONCATENATES `reporters`, so naming it in both
      // files makes the aggregate run emit its summary twice.
      passWithNoTests: false,
      projects: [
        {
          extends: true,
          test: {
            name: 'conformance',
            isolate: false,
            include: ['conformance/**/*.test.ts'],
            exclude: [...COMMON_EXCLUDE],
            // Several conformance contracts start real Node processes or worker threads which load a
            // complete importer graph. Their assertions are fast once loaded, but startup competes with
            // the rest of the project on a busy host and is not a product-operation deadline.
            testTimeout: 30_000,
            sequence: { groupOrder: 0 },
          },
        },
        {
          extends: true,
          test: {
            name: 'shared',
            isolate: false,
            include: ['packages/**/src/**/*.test.ts', 'scripts/**/*.test.ts', 'tools/host-probe/src/**/*.test.ts'],
            exclude: [
              ...COMMON_EXCLUDE,
              ...TOOL_CAPTURE_TEST_FILES,
              ...REGISTRY_ISOLATED_TEST_FILES,
              TEST_RUN_COVERAGE_FILE,
            ],
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
            name: 'coverage-gate',
            environment: 'node',
            fileParallelism: false,
            isolate: true,
            include: [TEST_RUN_COVERAGE_FILE],
            exclude: [...COMMON_EXCLUDE, ...TOOL_CAPTURE_TEST_FILES],
            // This file starts nested root runners to prove inert selections fail. Running it after the
            // parallel projects prevents those child processes from competing with the pool they verify.
            sequence: { groupOrder: 1 },
          },
        },
        {
          extends: true,
          test: {
            name: 'tool-capture',
            environment: 'node',
            // Its browser contracts launch Chromium against the host GPU, so they run serially and
            // after the parallel projects for the same reason the coverage gate does.
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
