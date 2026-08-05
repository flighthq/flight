import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

/**
 * Packages that own test files but contributed none to this run.
 *
 * Derived by comparing what is on disk against what actually executed, rather than restated from the
 * config. A hand-maintained list of exclusions is a second source that drifts from the excludes it
 * describes — the same failure this exists to catch, one level up. Asking "did this package run"
 * instead of "is it named in a list" also catches every way a package can go missing: an exclude glob,
 * a project whose include matches nothing, a typo, a package added to no project at all.
 */
export function findUnrunTestPackages(root: string, executedFiles: readonly string[]): string[] {
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return [];

  const ran = new Set<string>();
  for (const file of executedFiles) {
    const parts = relative(root, file).split(sep);
    if (parts[0] === 'packages' && parts.length > 1) ran.add(parts[1]);
  }

  const unrun: string[] = [];
  for (const name of readdirSync(packagesDir)) {
    if (ran.has(name)) continue;
    if (hasTestFile(join(packagesDir, name, 'src'))) unrun.push(name);
  }
  return unrun.sort();
}

/**
 * Test files a whole-repo run deliberately does not execute, and where the coverage actually lives.
 *
 * A DELIBERATE OMISSION IS STILL AN OMISSION. The package-level report above catches a package that
 * vanished entirely; this catches the subtler case where a package still runs and only some of its files
 * quietly do not — which no count reveals, because the remaining files all pass. If the named leg ever
 * stops running these, this line is the only place a reader would learn the contract is now covered
 * nowhere, rather than reading "1439 passed" and believing it.
 */
export function findOmittedTestFiles(root: string, executedFiles: readonly string[]): string[] {
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return [];
  const ran = new Set(executedFiles.map((file) => relative(root, file)));
  const omitted: string[] = [];
  collectMatchingTestFiles(packagesDir, root, omitted);
  return omitted.filter((file) => !ran.has(file)).sort();
}

function collectMatchingTestFiles(dir: string, root: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') collectMatchingTestFiles(full, root, out);
      continue;
    }
    if (DELIBERATELY_OMITTED_TEST_FILE.test(entry.name)) out.push(relative(root, full));
  }
}

function hasTestFile(dir: string): boolean {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (hasTestFile(join(dir, entry.name))) return true;
      continue;
    }
    if (entry.name.endsWith('.test.ts')) return true;
  }
  return false;
}

// Browser contracts. They launch Chromium, which the root run has no browser for, so they are excluded
// from the tool-capture project and run by `npm run test:unit` under each package's own config — on the
// CI leg that installs it. Kept as a pattern rather than a file list so a NEW e2e file is announced the
// day it is added instead of joining the silence.
const DELIBERATELY_OMITTED_TEST_FILE = /\.e2e\.test\.ts$/;

// A positional argument is a name or path filter, so the run is a subset BY REQUEST rather than by
// omission. Flags are not, and neither is the `run` verb itself.
export function isFilteredTestRun(argv: readonly string[]): boolean {
  return argv.some((argument) => argument !== 'run' && !argument.startsWith('-'));
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

    this.reportOmittedPackages(testModules, reason);

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

  // A whole-repo run READS as a claim about the whole repo, so it has to say where it is not one. The
  // runner is already loud about covering nothing; covering LESS deserves the same voice, and an
  // omission is otherwise invisible until someone counts. Never fails the build — an omission can be
  // deliberate, and the point is that it is visible the day it appears rather than years later.
  // Silent on a filtered run, where covering a subset is the request rather than a gap.
  private reportOmittedPackages(
    testModules: Parameters<NonNullable<Reporter['onTestRunEnd']>>[0],
    reason: Parameters<NonNullable<Reporter['onTestRunEnd']>>[2],
  ): void {
    if (reason === 'interrupted' || isFilteredTestRun(process.argv.slice(2))) return;
    const omitted = findUnrunTestPackages(
      process.cwd(),
      testModules.map((testModule) => testModule.moduleId),
    );
    const omittedFiles = findOmittedTestFiles(
      process.cwd(),
      testModules.map((testModule) => testModule.moduleId),
    );
    if (omittedFiles.length > 0) {
      console.error(
        `\nThis run did NOT execute ${omittedFiles.length} browser-contract file${omittedFiles.length === 1 ? '' : 's'}: ${omittedFiles.join(', ')}.` +
          `\nThey need a browser this run has none for; \`npm run test:unit\` runs them under each package's own config. If that leg stops, they are covered nowhere.`,
      );
    }
    if (omitted.length === 0) return;
    console.error(
      `\nThis run OMITTED ${omitted.length} package${omitted.length === 1 ? '' : 's'} that own test files: ${omitted.join(', ')}.` +
        `\nA whole-repo pass is a claim about the packages it ran. If the omission is deliberate it is still an omission.`,
    );
  }
}
