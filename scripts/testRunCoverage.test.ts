import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isTestRunCoverageFailure } from './testRunCoverage';

const COVERED: Readonly<Parameters<typeof isTestRunCoverageFailure>[0]> = {
  interrupted: false,
  testExecutions: 1,
  testFiles: 1,
};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_RUN_TIMEOUT_MS = 15_000;

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
