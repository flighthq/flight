// The DEFAULT UNIT LANE: the population `npm test` runs, defined once so the Vitest project and the
// cost gate cannot disagree about what "a standard test" is. `vitest.config.ts` consumes these globs
// for its `shared` project; `check-unit-test-cost.ts` enumerates the same files from disk. A gate that
// derived its own population would eventually police a set the runner does not run — the defect the
// single definition exists to prevent.
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { REGISTRY_ISOLATED_TEST_FILES } from './registryIsolatedTests';

export const UNIT_TEST_LANE_INCLUDE: readonly string[] = ['packages/**/src/**/*.test.ts', 'scripts/**/*.test.ts'];

// The INTEGRATION LANE: files that start a child process, and therefore are not unit tests. Each drives
// a real executable — a CLI, `tsc`, `npm`, `git`, `tar` — so its subject is the integration, not a unit,
// and the cost follows from that rather than from anything the file could be rewritten to avoid.
//
// ★ THEY ARE ROUTED, NOT EXCLUDED, AND THE DIFFERENCE IS THE WHOLE POINT. CI runs `npm test` (the shared
// project) and `npm run test:unit` (each package under its own config); a `scripts/*.test.ts` dropped
// from the shared project would therefore run in NEITHER. `vitest.config.ts` gives them their own
// project and `unit-test-cost:check`'s sibling gate `integration-tests:check` runs it, so moving a file
// here changes WHEN it runs, never WHETHER. This repository has already paid for the other choice once:
// tool-capture was excluded rather than routed, and the package that decides whether a capture drew
// anything became the one package nothing verified.
export const INTEGRATION_TEST_FILES: readonly string[] = [
  'packages/host-tauri/src/tauriHost.test.ts',
  'packages/host-tauri/src/tauriPackage.test.ts',
  'scripts/fixtures.test.ts',
  'scripts/package-publish-artifacts.test.ts',
  'scripts/package-todo-churn.test.ts',
  'scripts/path-shape-vocabulary.test.ts',
  'scripts/reference-image-commission-batch.test.ts',
  'scripts/reference-image-commission.test.ts',
  'scripts/registrar-child-process.test.ts',
  'scripts/render-lane-architecture.test.ts',
  'scripts/teardown-rejection.test.ts',
  'scripts/unchecked.test.ts',
];

/** Files matched by the include globs that the shared project deliberately does not run. */
export const UNIT_TEST_LANE_EXCLUDE: readonly string[] = [
  '**/.claude/**',
  '**/node_modules/**',
  // Routed to its own project: node environment, serial files, and browser contracts against the host GPU.
  'packages/tool-capture/src/**/*.test.ts',
  // Cannot share a module registry; see registryIsolatedTests.ts for the reason on each.
  ...REGISTRY_ISOLATED_TEST_FILES,
  // Starts nested root runners, so it runs after the parallel projects rather than inside them.
  'scripts/testRunCoverage.test.ts',
  // Not unit tests: they start child processes. Routed to the integration project, never dropped.
  ...INTEGRATION_TEST_FILES,
];

/**
 * Every test file the default lane actually runs, repository-relative and sorted. Walks the two include
 * roots rather than expanding globs so the gate depends on the tree it is judging, not on a glob library.
 */
export function readUnitTestLaneFiles(root: string): string[] {
  const excluded = new Set(UNIT_TEST_LANE_EXCLUDE.filter((pattern) => !pattern.includes('*')));
  return ['packages', 'scripts']
    .flatMap((directory) => testFilesUnder(resolve(root, directory)))
    .map((path) => relative(root, path).replaceAll('\\', '/'))
    .filter((path) => !path.startsWith('packages/tool-capture/') && !excluded.has(path))
    .filter((path) => (path.startsWith('packages/') ? /^packages\/[^/]+\/src\//u.test(path) : true))
    .sort();
}

/**
 * Integration paths that name no file. The include list is exact paths, so a renamed or deleted entry
 * matches nothing and vitest still passes on the files that DO match — the routed test simply stops
 * running, silently. This is what makes "routed, never dropped" a checkable claim rather than a promise.
 */
export function findMissingIntegrationTestFiles(root: string): string[] {
  return INTEGRATION_TEST_FILES.filter((path) => !existsSync(resolve(root, path))).sort();
}

function testFilesUnder(directory: string): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ['.claude', 'build', 'dist', 'node_modules'].includes(entry.name) ? [] : testFilesUnder(path);
    }
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [path] : [];
  });
}
