import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { getSelectors, selectPackages } from './select';

// Lists the branch arms in one package that no test ever took. `npm run untested geometry`.
//
// It is a LIST, not a score. The only number is the list's length, and it is an absolute count: a
// branch you write and test costs zero entries, so there is no ratio to game and no reason to avoid
// writing a legitimate conditional. Nothing here gates — not `npm run check`, not CI — and that is
// deliberate. A gated percentage rewards hollow tests that execute a line without asserting anything;
// a list of locations only rewards going and looking.
//
// Nothing it produces is committed. The coverage JSON lands in a temp directory that is removed on the
// way out, in the spirit of agents/packages/todo.mjs: a derived view costing seconds to rebuild should
// be rebuilt, not merged.
//
// WHAT THIS CANNOT TELL YOU. An arm missing from the list was TAKEN by some test; it was not necessarily
// CHECKED by one. A test can execute a branch and still be unable to distinguish correct behavior from
// broken — a symmetric fixture is the usual way it happens. Measured twice on this package in one day: a
// cube reaches every arm of an axis-by-axis slab test while an axis-swap mutant inside it goes unnoticed,
// and three diagonal-matrix tests covered `scaleMatrix4` at 100% while it scaled rows instead of columns,
// because a diagonal matrix cannot tell the two apart. So an empty list means nobody has looked HERE, not
// that the package is verified. The complement of this list is a set of locations, not a warrant; only a
// human reading the assertion, or a mutation pass, can tell you an arm is genuinely pinned down.
//
// WHY THE `include` GLOB IS THE WHOLE TRICK. A plain `vitest run --coverage packages/geometry` prints a
// global summary spanning every module the run LOADED, which for geometry means entity, log, signals and
// types are pulled in as dependencies with none of their own tests. Measured on this tree: that global
// reads 64.43% branches while geometry's own source reads 86.27%, and 245 of the 342 polluting branches
// come from `log` alone. Reporting those as geometry's would send a reader to fix a package they are not
// working in. Scoping coverage to `packages/<name>/src` is what makes the output about the named package.

interface BranchLocation {
  end?: { column?: number | null; line?: number | null } | null;
  start?: { column?: number | null; line?: number | null } | null;
}

interface BranchMapEntry {
  line?: number;
  loc?: BranchLocation;
  locations?: readonly BranchLocation[];
  type?: string;
}

interface FileCoverage {
  b: Record<string, readonly number[]>;
  branchMap: Record<string, BranchMapEntry>;
}

export interface UntestedBranch {
  /** Verbatim source at the arm's own range, present only when that range is unambiguous. */
  armText: string | null;
  index: number;
  line: number;
  /** Verbatim text of the source line, always present. Never authored, never inferred. */
  sourceLine: string;
  type: string;
}

export interface UntestedFile {
  branches: UntestedBranch[];
  path: string;
}

const TAKEN_IS_NOT_CHECKED =
  'Absence from this list means a test TOOK the arm, not that a test would CATCH it breaking.';

const scriptsDirectory = resolve(fileURLToPath(import.meta.url), '..');
const repoRoot = resolve(scriptsDirectory, '..');

// The arm's own source text, but only when the recorded range is complete and single-line. v8's
// istanbul-shaped branch map leaves `end.column` null on most arms and omits the location entirely on
// implicit else arms — measured at 94 and 12 of geometry's 131 arms respectively. Those are exactly the
// cases where slicing would produce confident nonsense, so they degrade to the bare line above instead.
export function extractArmText(lines: readonly string[], location: BranchLocation | undefined): string | null {
  const start = location?.start;
  const end = location?.end;
  if (typeof start?.line !== 'number' || typeof start.column !== 'number') return null;
  if (typeof end?.line !== 'number' || typeof end.column !== 'number') return null;
  if (end.line !== start.line || end.column <= start.column) return null;
  const line = lines[start.line - 1];
  if (line === undefined) return null;
  const text = line.slice(start.column, end.column).trim();
  return text.length > 0 ? text : null;
}

export function collectUntestedBranches(coverage: FileCoverage, source: string): UntestedBranch[] {
  const lines = source.split('\n');
  const branches: UntestedBranch[] = [];

  for (const [id, counts] of Object.entries(coverage.b)) {
    const entry = coverage.branchMap[id];
    if (entry === undefined) continue;

    counts.forEach((count, index) => {
      if (count !== 0) return;
      const location = entry.locations?.[index];
      const line = location?.start?.line ?? entry.loc?.start?.line ?? entry.line;
      if (typeof line !== 'number') return;
      branches.push({
        armText: extractArmText(lines, location),
        index: index + 1,
        line,
        sourceLine: (lines[line - 1] ?? '').trim(),
        type: entry.type ?? 'branch',
      });
    });
  }

  return branches.sort((a, b) => a.line - b.line || a.index - b.index);
}

// Weakest first, matching how the package TODO index ranks work: the file with the most unexamined arms
// is the one worth opening. Ties break on path so repeated runs print in a stable order.
export function rankUntestedFiles(files: readonly UntestedFile[]): UntestedFile[] {
  return [...files].sort((a, b) => b.branches.length - a.branches.length || a.path.localeCompare(b.path));
}

function readCoverage(reportDirectory: string): Record<string, FileCoverage> {
  const file = join(reportDirectory, 'coverage-final.json');
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, FileCoverage>;
}

function runCoverage(packageName: string, reportDirectory: string): number {
  const vitest = resolve(repoRoot, 'node_modules/vitest/vitest.mjs');
  const result = spawnSync(
    process.execPath,
    [
      vitest,
      'run',
      `packages/${packageName}`,
      '--coverage',
      '--coverage.provider=v8',
      `--coverage.include=packages/${packageName}/src/**/*.ts`,
      '--coverage.exclude=**/*.test.ts',
      '--coverage.reporter=json',
      `--coverage.reportsDirectory=${reportDirectory}`,
      // Zeroed deliberately. The repository thresholds exist for `test:coverage`; inheriting them here
      // would turn a reading tool into a gate, which is the one thing this must never become.
      '--coverage.thresholds.branches=0',
      '--coverage.thresholds.functions=0',
      '--coverage.thresholds.lines=0',
      '--coverage.thresholds.statements=0',
    ],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
}

function report(packageName: string): boolean {
  const reportDirectory = mkdtempSync(join(tmpdir(), `untested-${packageName}-`));
  try {
    const status = runCoverage(packageName, reportDirectory);
    const coverage = readCoverage(reportDirectory);
    const entries = Object.entries(coverage);

    // A run that reported on no source file is a broken invocation, never a clean package. Without this
    // an `include` glob that matches nothing prints "0 unexamined branches" — a false all-clear, which
    // is worse than any red, because it is passed onward in good faith.
    if (entries.length === 0) {
      console.error(pc.red(`untested: coverage reported on no source file under packages/${packageName}/src.`));
      if (status !== 0) console.error(pc.dim('  vitest exited nonzero — the package may have no test files.'));
      return false;
    }

    const files: UntestedFile[] = entries
      .map(([absolute, fileCoverage]) => ({
        branches: collectUntestedBranches(fileCoverage, readFileSync(absolute, 'utf8')),
        path: relative(repoRoot, absolute).replaceAll('\\', '/'),
      }))
      .filter((file) => file.branches.length > 0);

    const total = files.reduce((sum, file) => sum + file.branches.length, 0);
    const width = String(Math.max(...files.flatMap((f) => f.branches.map((b) => b.line)), 0)).length;

    console.log(pc.bold(`untested — @flighthq/${packageName}`));
    if (total === 0) {
      console.log(`Every branch in ${entries.length} source files was taken by a test.`);
      console.log(pc.dim(TAKEN_IS_NOT_CHECKED));
      return true;
    }
    console.log(`${total} unexamined branch arms in ${files.length} of ${entries.length} source files.\n`);

    for (const file of rankUntestedFiles(files)) {
      console.log(`${pc.cyan(file.path)} ${pc.dim(`— ${file.branches.length}`)}`);
      for (const branch of file.branches) {
        console.log(`  ${pc.dim(String(branch.line).padStart(width))} │ ${branch.sourceLine}`);
        const arm = branch.armText === null ? '' : ` · ${branch.armText}`;
        console.log(`  ${' '.repeat(width)} ${pc.dim(`└ ${branch.type} arm ${branch.index}${arm}`)}`);
      }
      console.log();
    }
    console.log(pc.dim(TAKEN_IS_NOT_CHECKED));
    return true;
  } finally {
    rmSync(reportDirectory, { force: true, recursive: true });
  }
}

function main(): void {
  const selectors = getSelectors();
  // Per-package is the only mode. A bare whole-repo sweep would pay vitest's fixed ~20s startup once per
  // package, and the resulting thousands of lines would be a dashboard — the shape this tool exists to
  // not be. Name the package you are working in.
  if (selectors.length === 0) {
    console.error(pc.red('untested: name a package — `npm run untested geometry`.'));
    process.exit(1);
  }

  const packages = selectPackages(selectors);
  if (packages.length === 0) {
    console.error(pc.red(`untested: no package matches ${selectors.map((s) => `'${s}'`).join(', ')}.`));
    process.exit(1);
  }
  if (packages.length > 1) {
    console.log(pc.dim(`untested: ${packages.length} packages match — ${packages.join(', ')}\n`));
  }

  // Always exits 0 on findings. The list is the product; failing on it would make it a gate.
  let ok = true;
  for (const packageName of packages) ok = report(packageName) && ok;
  if (!ok) process.exit(1);
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
