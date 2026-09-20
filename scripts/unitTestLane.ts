// The UNIT LANE: the population `npm run test` runs, defined once so the Vitest config and the
// cost gate cannot disagree about what "a standard test" is. Package-colocated tests only —
// `scripts/*.test.ts` are policy gates, structure checks, and tooling tests that belong in
// `npm run check` or dedicated commands, not in the fast unit run.
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { REGISTRY_ISOLATED_TEST_FILES } from './registryIsolatedTests';

export const UNIT_TEST_LANE_INCLUDE: readonly string[] = ['packages/**/src/**/*.test.ts'];

// Package test files that start a child process and therefore cannot share a worker.
export const INTEGRATION_TEST_FILES: readonly string[] = [
  'packages/host-tauri/src/tauriHost.test.ts',
  'packages/host-tauri/src/tauriPackage.test.ts',
];

export const UNIT_TEST_LANE_EXCLUDE: readonly string[] = [
  '**/.claude/**',
  '**/node_modules/**',
  'packages/tool-capture/src/**/*.test.ts',
  ...REGISTRY_ISOLATED_TEST_FILES,
  ...INTEGRATION_TEST_FILES,
];

export function readUnitTestLaneFiles(root: string): string[] {
  const excluded = new Set(UNIT_TEST_LANE_EXCLUDE.filter((pattern) => !pattern.includes('*')));
  return testFilesUnder(resolve(root, 'packages'))
    .map((path) => relative(root, path).replaceAll('\\', '/'))
    .filter((path) => !path.startsWith('packages/tool-capture/') && !excluded.has(path))
    .filter((path) => /^packages\/[^/]+\/src\//u.test(path))
    .sort();
}

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
