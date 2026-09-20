import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGISTRY_ISOLATED_TEST_FILES } from './registryIsolatedTests';
import { UNIT_TEST_LANE_EXCLUDE, UNIT_TEST_LANE_INCLUDE, readUnitTestLaneFiles } from './unitTestLane';

describe('readUnitTestLaneFiles', () => {
  // Built against a temporary tree rather than the repository, so the case states its own population.
  // The real lane's reach is floored inside the gate (`MINIMUM_LANE_FILES`), which is where a
  // scanned-nothing result has to fail — a unit test re-walking the repository to prove that would pay
  // for the claim on every `npm test` and still leave the gate able to pass over an empty scan.
  it('collects package src and scripts tests, and nothing else', () => {
    const root = makeTree({
      'packages/alpha/src/a.test.ts': '',
      'packages/alpha/src/nested/b.test.ts': '',
      'packages/alpha/src/notATest.ts': '',
      'packages/alpha/test/outsideSrc.test.ts': '',
      'scripts/c.test.ts': '',
      'scripts/notATest.ts': '',
    });
    try {
      expect(readUnitTestLaneFiles(root)).toEqual([
        'packages/alpha/src/a.test.ts',
        'packages/alpha/src/nested/b.test.ts',
        'scripts/c.test.ts',
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('drops the routed and isolated files the shared project does not run', () => {
    const root = makeTree({
      'packages/tool-capture/src/routed.test.ts': '',
      'scripts/kept.test.ts': '',
      'scripts/testRunCoverage.test.ts': '',
    });
    try {
      expect(readUnitTestLaneFiles(root)).toEqual(['scripts/kept.test.ts']);
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

  it('returns nothing for a tree with neither root', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-lane-'));
    try {
      expect(readUnitTestLaneFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe('UNIT_TEST_LANE_EXCLUDE', () => {
  // The whole point of this module is that the runner and the gate cannot disagree about the lane, so
  // the exclusions the config relies on have to actually be present here.
  it('carries every registry-isolated file', () => {
    for (const file of REGISTRY_ISOLATED_TEST_FILES) expect(UNIT_TEST_LANE_EXCLUDE).toContain(file);
  });

  it('routes tool-capture away from the shared project', () => {
    expect(UNIT_TEST_LANE_EXCLUDE).toContain('packages/tool-capture/src/**/*.test.ts');
  });
});

describe('UNIT_TEST_LANE_INCLUDE', () => {
  it('names the two roots the shared project runs', () => {
    expect(UNIT_TEST_LANE_INCLUDE).toEqual(['packages/**/src/**/*.test.ts', 'scripts/**/*.test.ts']);
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
