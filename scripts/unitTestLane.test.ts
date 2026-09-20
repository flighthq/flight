import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REGISTRY_ISOLATED_TEST_FILES } from './registryIsolatedTests';
import {
  INTEGRATION_TEST_FILES,
  UNIT_TEST_LANE_EXCLUDE,
  UNIT_TEST_LANE_INCLUDE,
  findMissingIntegrationTestFiles,
  readUnitTestLaneFiles,
} from './unitTestLane';

describe('findMissingIntegrationTestFiles', () => {
  // The integration project's include is exact paths, so a renamed entry matches nothing and vitest
  // still passes on the files that DO match. Without this the routed test would stop running silently,
  // which is the failure that makes "routed, never dropped" a promise instead of a claim.
  it('names an integration path that no longer exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-lane-'));
    try {
      expect(findMissingIntegrationTestFiles(root)).toEqual([...INTEGRATION_TEST_FILES].sort());
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('names nothing when every integration path resolves', () => {
    expect(findMissingIntegrationTestFiles(process.cwd())).toEqual([]);
  });
});

describe('INTEGRATION_TEST_FILES', () => {
  it('names each file once', () => {
    expect(new Set(INTEGRATION_TEST_FILES).size).toBe(INTEGRATION_TEST_FILES.length);
  });

  // ★ THE PARTITION HAS TO BE TOTAL. Lane and integration are complements, and a file in neither would
  // run nowhere while both lists still looked healthy — so the claim is asserted, not assumed.
  it('is disjoint from the lane and, with it, covers every test file under the two roots', () => {
    const lane = readUnitTestLaneFiles(process.cwd());

    for (const file of INTEGRATION_TEST_FILES) expect(lane).not.toContain(file);
    expect(UNIT_TEST_LANE_EXCLUDE).toEqual(expect.arrayContaining([...INTEGRATION_TEST_FILES]));
  });
});

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
