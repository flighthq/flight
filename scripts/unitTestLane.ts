// The UNIT LANE: the population `npm run test` runs. One runner, one project, package-colocated
// tests only. Everything else — scripts tests, integration tests, isolated-registry tests,
// host backends, dev tools — belongs in a different command.
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { REGISTRY_ISOLATED_TEST_FILES } from './registryIsolatedTests.ts';

export const UNIT_TEST_LANE_INCLUDE: readonly string[] = ['packages/**/src/**/*.test.ts'];

export const UNIT_TEST_LANE_EXCLUDE: readonly string[] = [
  '**/.claude/**',
  '**/node_modules/**',
  'packages/host-*/src/**/*.test.ts',
  'packages/tool-*/src/**/*.test.ts',
  ...REGISTRY_ISOLATED_TEST_FILES,
];

export function readUnitTestLaneFiles(root: string): string[] {
  const excluded = new Set(UNIT_TEST_LANE_EXCLUDE.filter((pattern) => !pattern.includes('*')));
  return testFilesUnder(resolve(root, 'packages'))
    .map((path) => relative(root, path).replaceAll('\\', '/'))
    .filter((path) => !path.startsWith('packages/host-') && !path.startsWith('packages/tool-') && !excluded.has(path))
    .filter((path) => /^packages\/[^/]+\/src\//u.test(path))
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
