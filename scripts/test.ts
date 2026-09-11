import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEST_RUN_COMPLETENESS_ENV,
  TEST_RUN_COMPLETENESS_VERSION,
  type TestRunCompletenessReport,
} from './testRunCompleteness';

export interface TestRunAssessment {
  diagnostic?: string;
  exitCode: number;
}

export function resolveVitestArguments(arguments_: readonly string[]): string[] {
  if (arguments_[0] === 'conformance') return ['--project', 'conformance', ...arguments_.slice(1)];
  if (arguments_.includes('--all')) return arguments_.filter((a) => a !== '--all');
  if (arguments_.some((a) => a === '--project' || a.startsWith('--project='))) return [...arguments_];
  return ['--project', 'shared', ...arguments_];
}

export function preserveRequiredReporter(arguments_: readonly string[], reporterPath: string): string[] {
  const overridesReporters = arguments_.some(
    (argument) => argument === '--reporter' || argument.startsWith('--reporter='),
  );
  return overridesReporters ? [...arguments_, `--reporter=${reporterPath}`] : [...arguments_];
}

export function assessVitestRun(status: number | null, report: unknown): TestRunAssessment {
  if (status !== 0) return { exitCode: status ?? 1 };
  if (!isTestRunCompletenessReport(report)) {
    return {
      diagnostic: 'Vitest did not produce its structured completion event.',
      exitCode: 1,
    };
  }
  if (!report.runEnded) {
    return {
      diagnostic: 'Vitest started but did not produce its structured run-completion event.',
      exitCode: 1,
    };
  }
  if (report.unhandledErrors > 0) {
    return {
      diagnostic: `Vitest reported ${report.unhandledErrors} unhandled worker error${report.unhandledErrors === 1 ? '' : 's'}.`,
      exitCode: 1,
    };
  }
  if (report.reason !== 'passed') {
    return {
      diagnostic: `Vitest's structured run result was ${report.reason ?? 'absent'}, despite status 0.`,
      exitCode: 1,
    };
  }

  const incomplete = findIncompleteTestFiles(report.expected, report.completed);
  if (incomplete.length > 0) {
    return {
      diagnostic: `Vitest did not complete ${incomplete.length} scheduled test file${incomplete.length === 1 ? '' : 's'}: ${incomplete.join(', ')}`,
      exitCode: 1,
    };
  }
  return { exitCode: 0 };
}

function findIncompleteTestFiles(expected: readonly string[], completed: readonly string[]): string[] {
  const remaining = new Map<string, number>();
  for (const file of completed) remaining.set(file, (remaining.get(file) ?? 0) + 1);
  return expected.filter((file) => {
    const count = remaining.get(file) ?? 0;
    if (count === 0) return true;
    remaining.set(file, count - 1);
    return false;
  });
}

function isTestRunCompletenessReport(value: unknown): value is TestRunCompletenessReport {
  if (typeof value !== 'object' || value === null) return false;
  const report = value as Partial<TestRunCompletenessReport>;
  return (
    report.version === TEST_RUN_COMPLETENESS_VERSION &&
    Array.isArray(report.expected) &&
    report.expected.every((file) => typeof file === 'string') &&
    Array.isArray(report.completed) &&
    report.completed.every((file) => typeof file === 'string') &&
    typeof report.runEnded === 'boolean' &&
    Number.isInteger(report.unhandledErrors) &&
    (report.unhandledErrors ?? -1) >= 0 &&
    (report.reason === undefined ||
      report.reason === 'passed' ||
      report.reason === 'failed' ||
      report.reason === 'interrupted')
  );
}

function readCompletenessReport(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function main(): void {
  const vitestPath = resolve(import.meta.dirname, '../node_modules/vitest/vitest.mjs');
  const completenessReporterPath = resolve(import.meta.dirname, 'testRunCompleteness.ts');
  const reportDirectory = mkdtempSync(join(tmpdir(), 'flight-vitest-'));
  const reportPath = join(reportDirectory, 'completeness.json');
  try {
    const vitestArguments = preserveRequiredReporter(
      resolveVitestArguments(process.argv.slice(2)),
      completenessReporterPath,
    );
    const result = spawnSync(process.execPath, [vitestPath, 'run', ...vitestArguments], {
      env: { ...process.env, [TEST_RUN_COMPLETENESS_ENV]: reportPath },
      stdio: 'inherit',
    });
    if (result.error !== undefined) throw result.error;
    const assessment = assessVitestRun(result.status, readCompletenessReport(reportPath));
    if (assessment.diagnostic !== undefined) console.error(`\n${assessment.diagnostic}`);
    process.exitCode = assessment.exitCode;
  } finally {
    rmSync(reportDirectory, { force: true, recursive: true });
  }
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
