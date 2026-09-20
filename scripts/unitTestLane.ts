// The DEFAULT UNIT LANE: the population `npm test` runs, defined once so the Vitest project and the
// cost gate cannot disagree about what "a standard test" is. `vitest.config.ts` consumes these globs
// for its `shared` project; `check-unit-test-cost.ts` enumerates the same files from disk. A gate that
// derived its own population would eventually police a set the runner does not run — the defect the
// single definition exists to prevent.
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { REGISTRY_ISOLATED_TEST_FILES } from './registryIsolatedTests';

export const UNIT_TEST_LANE_INCLUDE: readonly string[] = ['packages/**/src/**/*.test.ts', 'scripts/**/*.test.ts'];

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
