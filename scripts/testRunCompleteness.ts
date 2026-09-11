import { renameSync, writeFileSync } from 'node:fs';

import type { Reporter } from 'vitest/reporters';

export const TEST_RUN_COMPLETENESS_ENV = 'FLIGHT_VITEST_COMPLETENESS_FILE';
export const TEST_RUN_COMPLETENESS_VERSION = 1;

export interface TestRunCompletenessReport {
  completed: string[];
  expected: string[];
  reason?: 'failed' | 'interrupted' | 'passed';
  runEnded: boolean;
  unhandledErrors: number;
  version: typeof TEST_RUN_COMPLETENESS_VERSION;
}

/**
 * A machine-readable account of Vitest's runner lifecycle.
 *
 * Vitest can lose a worker after scheduling its files. Its terminal summary then contains the clue, but
 * terminal prose is not an API and has historically disagreed with the process status. This reporter
 * records the runner's own structured events instead: every scheduled specification must reach the
 * per-module completion hook and the aggregate run must finish without an unhandled error.
 */
export class TestRunCompletenessReporter implements Reporter {
  private completed: string[] = [];
  private expected: string[] = [];
  private readonly outputPath = process.env[TEST_RUN_COMPLETENESS_ENV];

  onTestRunStart(specifications: Parameters<NonNullable<Reporter['onTestRunStart']>>[0]): void {
    if (this.outputPath === undefined) return;
    this.expected = specifications.map((specification) => specification.moduleId);
    this.completed = [];
    this.write({
      completed: this.completed,
      expected: this.expected,
      runEnded: false,
      unhandledErrors: 0,
      version: TEST_RUN_COMPLETENESS_VERSION,
    });
  }

  onTestModuleEnd(testModule: Parameters<NonNullable<Reporter['onTestModuleEnd']>>[0]): void {
    if (this.outputPath === undefined) return;
    this.completed.push(testModule.moduleId);
    this.write({
      completed: this.completed,
      expected: this.expected,
      runEnded: false,
      unhandledErrors: 0,
      version: TEST_RUN_COMPLETENESS_VERSION,
    });
  }

  onTestRunEnd(
    _testModules: Parameters<NonNullable<Reporter['onTestRunEnd']>>[0],
    unhandledErrors: Parameters<NonNullable<Reporter['onTestRunEnd']>>[1],
    reason: Parameters<NonNullable<Reporter['onTestRunEnd']>>[2],
  ): void {
    if (this.outputPath === undefined) return;
    this.write({
      completed: this.completed,
      expected: this.expected,
      reason,
      runEnded: true,
      unhandledErrors: unhandledErrors.length,
      version: TEST_RUN_COMPLETENESS_VERSION,
    });
  }

  private write(report: Readonly<TestRunCompletenessReport>): void {
    if (this.outputPath === undefined) return;
    const temporaryPath = `${this.outputPath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(report));
    renameSync(temporaryPath, this.outputPath);
  }
}

export default TestRunCompletenessReporter;
