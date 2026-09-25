import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGISTRY_ISOLATED_TEST_FILES } from './registryIsolatedTests.ts';
import { UNIT_TEST_LANE_EXCLUDE, UNIT_TEST_LANE_INCLUDE, readUnitTestLaneFiles } from './unitTestLane.ts';

describe('readUnitTestLaneFiles', () => {
  it('collects package src tests only', () => {
    const root = makeTree({
      'packages/alpha/src/a.test.ts': '',
      'packages/alpha/src/nested/b.test.ts': '',
      'packages/alpha/src/notATest.ts': '',
      'packages/alpha/test/outsideSrc.test.ts': '',
      'scripts/c.test.ts': '',
    });
    try {
      expect(readUnitTestLaneFiles(root)).toEqual([
        'packages/alpha/src/a.test.ts',
        'packages/alpha/src/nested/b.test.ts',
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('drops host backends, dev tools, and isolated files', () => {
    const root = makeTree({
      'packages/host-web/src/routed.test.ts': '',
      'packages/tool-capture/src/routed.test.ts': '',
      'packages/alpha/src/kept.test.ts': '',
    });
    try {
      expect(readUnitTestLaneFiles(root)).toEqual(['packages/alpha/src/kept.test.ts']);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('skips build output rather than reporting it as lane population', () => {
    const root = makeTree({ 'packages/alpha/src/dist/stale.test.ts': '', 'packages/alpha/src/live.test.ts': '' });
    try {
      expect(readUnitTestLaneFiles(root)).toEqual(['packages/alpha/src/live.test.ts']);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('returns nothing for a tree with no packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-lane-'));
    try {
      expect(readUnitTestLaneFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe('UNIT_TEST_LANE_EXCLUDE', () => {
  it('carries every registry-isolated file', () => {
    for (const file of REGISTRY_ISOLATED_TEST_FILES) expect(UNIT_TEST_LANE_EXCLUDE).toContain(file);
  });

  it('routes host backends and dev tools away from the unit runner', () => {
    expect(UNIT_TEST_LANE_EXCLUDE).toContain('packages/host-*/src/**/*.test.ts');
    expect(UNIT_TEST_LANE_EXCLUDE).toContain('packages/tool-*/src/**/*.test.ts');
  });
});

describe('UNIT_TEST_LANE_INCLUDE', () => {
  it('covers package-colocated tests only', () => {
    expect(UNIT_TEST_LANE_INCLUDE).toEqual(['packages/**/src/**/*.test.ts']);
  });
});

function makeTree(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'flight-lane-'));
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}
