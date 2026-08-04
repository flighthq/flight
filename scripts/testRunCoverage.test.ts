import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findUnrunTestPackages, isFilteredTestRun, isTestRunCoverageFailure } from './testRunCoverage';

const COVERED: Readonly<Parameters<typeof isTestRunCoverageFailure>[0]> = {
  interrupted: false,
  testExecutions: 1,
  testFiles: 1,
};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The dedicated coverage-gate project runs after the parallel suite, so this is defense in depth for a
// genuinely slow machine rather than the mechanism that makes nested root runners reliable.
const ROOT_RUN_TIMEOUT_MS = 60_000;

describe('TestRunCoverageReporter', () => {
  it(
    'FAILS the real root runner when a file selector matches nothing',
    () => {
      const result = runRootVitest(['__test_run_coverage_no_such_file__']);
      expect(result.status).toBe(1);
      expect(result.output).toContain('ran NOTHING because no test files matched');
      expect(result.output).toContain('unconfigured, not clean');
    },
    ROOT_RUN_TIMEOUT_MS,
  );

  it(
    'FAILS the real root runner when a name filter matches no tests in a matched file',
    () => {
      const result = runRootVitest(['scripts/testRunCoverage.test.ts', '-t', '__test_run_coverage_no_such_name__']);
      expect(result.status).toBe(1);
      expect(result.output).toContain('ran NOTHING across 1 matched test file');
      expect(result.output).toContain('unconfigured, not clean');
    },
    ROOT_RUN_TIMEOUT_MS,
  );
});

describe('isTestRunCoverageFailure', () => {
  it('FAILS a run that matched no test files, the inert-run defect', () => {
    expect(isTestRunCoverageFailure({ ...COVERED, testExecutions: 0, testFiles: 0 })).toBe(true);
  });

  it('FAILS a run that matched files but executed no tests, the inert-run defect', () => {
    expect(isTestRunCoverageFailure({ ...COVERED, testExecutions: 0 })).toBe(true);
  });

  it('passes as soon as one test actually ran', () => {
    expect(isTestRunCoverageFailure(COVERED)).toBe(false);
  });

  it('exempts an interrupted run, whose remaining tests never ran', () => {
    expect(isTestRunCoverageFailure({ ...COVERED, interrupted: true, testExecutions: 0 })).toBe(false);
  });
});

function runRootVitest(args: readonly string[]): { output: string; status: number | null } {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}

// A whole-repo run reads as a claim about the whole repo, so it has to name where it is not one. These
// derive the answer from what RAN rather than from a restated exclusion list, because a second list
// drifts from the excludes it describes.
describe('findUnrunTestPackages', () => {
  it('names a package that owns tests but contributed none', () => {
    // tool-capture owns tests; pretend nothing from it executed.
    const unrun = findUnrunTestPackages(ROOT, [join(ROOT, 'packages', 'skeleton2d', 'src', 'skeleton2d.test.ts')]);

    expect(unrun).toContain('tool-capture');
    expect(unrun).not.toContain('skeleton2d');
  });

  it('names nothing when every package with tests contributed one', () => {
    const everyPackage = findUnrunTestPackages(ROOT, []);
    const executed = everyPackage.map((name) => join(ROOT, 'packages', name, 'src', 'x.test.ts'));

    expect(findUnrunTestPackages(ROOT, executed)).toEqual([]);
  });

  it('ignores a package that owns no test file at all', () => {
    // A package with no tests is not an omission — there was nothing to run. Built against a synthetic
    // tree rather than a named real package, so it cannot rot when that package gains tests.
    const root = mkdtempSync(join(tmpdir(), 'run-coverage-'));
    mkdirSync(join(root, 'packages', 'withtests', 'src'), { recursive: true });
    mkdirSync(join(root, 'packages', 'notests', 'src'), { recursive: true });
    writeFileSync(join(root, 'packages', 'withtests', 'src', 'a.test.ts'), '');
    writeFileSync(join(root, 'packages', 'notests', 'src', 'a.ts'), '');

    expect(findUnrunTestPackages(root, [])).toEqual(['withtests']);
  });
});

describe('isFilteredTestRun', () => {
  it('treats a positional argument as a filter, so a subset is the request', () => {
    expect(isFilteredTestRun(['run', 'scene2d-formats'])).toBe(true);
  });

  it('treats the bare run verb and flags as a whole-repo run', () => {
    expect(isFilteredTestRun(['run'])).toBe(false);
    expect(isFilteredTestRun(['run', '--reporter=dot'])).toBe(false);
  });
});
