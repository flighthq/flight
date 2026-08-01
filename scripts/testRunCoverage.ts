import type { Reporter } from 'vitest/reporters';

interface TestRunCoverage {
  interrupted: boolean;
  testExecutions: number;
  testFiles: number;
}

// Same doctrine, third gate: a test selection that ran NOTHING is unconfigured, not clean. The
// native no-files verdict and this reporter together judge the aggregate shared/isolated run.
export function isTestRunCoverageFailure(run: Readonly<TestRunCoverage>): boolean {
  if (run.interrupted) return false;
  return run.testFiles === 0 || run.testExecutions === 0;
}

export class TestRunCoverageReporter implements Reporter {
  onTestRunEnd(
    testModules: Parameters<NonNullable<Reporter['onTestRunEnd']>>[0],
    _unhandledErrors: Parameters<NonNullable<Reporter['onTestRunEnd']>>[1],
    reason: Parameters<NonNullable<Reporter['onTestRunEnd']>>[2],
  ): void {
    const testExecutions = testModules.reduce((count, testModule) => {
      const executed = [...testModule.children.allTests()].filter((testCase) => {
        const state = testCase.result().state;
        return state === 'failed' || state === 'passed';
      }).length;
      return count + executed;
    }, 0);
    if (
      !isTestRunCoverageFailure({
        interrupted: reason === 'interrupted',
        testExecutions,
        testFiles: testModules.length,
      })
    ) {
      return;
    }

    process.exitCode = 1;
    const scope =
      testModules.length === 0
        ? 'because no test files matched'
        : `across ${testModules.length} matched test file${testModules.length === 1 ? '' : 's'}`;
    console.error(`\nTest selection ran NOTHING ${scope} — this run is unconfigured, not clean.`);
  }
}
