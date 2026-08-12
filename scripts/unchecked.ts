import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { filterPaths, getSelectors, selectPackages } from './select';
import type { Mutant, MutantOutcome, MutantRequest, MutantResponse, UncheckedFile } from './unchecked-core';
import {
  APPLIED_MARKER,
  collectExecutedLines,
  MUTANT_ENVIRONMENT,
  planMutants,
  rankUncheckedFiles,
  selectReachableMutants,
  WORKER_PROTOCOL_PREFIX,
} from './unchecked-core';

// Lists the single-token edits to one package's source that every one of its tests still passes with in
// place. `npm run unchecked geometry` — or `npm run unchecked geometry/src/matrix.ts` for one file.
//
// It is the other half of `npm run untested`, and reads best next to it. That tool lists branch arms no test
// ever TOOK; this one takes the arms that were taken and asks whether any test would NOTICE them breaking.
// Its own header names the gap this fills: a cube reaches every arm of an axis-by-axis slab test while an
// axis-swap mutant inside it goes unnoticed, and three diagonal-matrix tests covered `scaleMatrix4` at 100%
// while it scaled rows instead of columns. Coverage cannot see either. A mutant can.
//
// Like `untested`, it is a LIST and never a score. There is no mutation-score percentage here on purpose: a
// gated ratio is satisfied by deleting the mutants you cannot kill, and the equivalent-mutant problem
// guarantees the achievable maximum is unknown and unknowable. Nothing here gates, nothing it produces is
// committed, and a survivor is an address to go and read — not a defect.
//
// WHAT THIS CANNOT TELL YOU. Three limits, each of which has produced a wrong reading somewhere:
//
//   1. A survivor may be EQUIVALENT — an edit that changes the text without changing behavior, which no
//      test could ever kill. Detecting those is undecidable; judging them is the reader's job.
//   2. The scope is the package's OWN suite. A mutant surviving here may still be caught by a downstream
//      package's tests. That is not a reprieve: a package whose own tests do not pin its behavior is the
//      finding regardless, because the downstream test will move.
//   3. A KILL proves a test noticed, not that the test is good. A snapshot asserting the whole output kills
//      almost everything while explaining nothing.
//
// WHY EVERY MUTANT GETS ITS OWN PROCESS. It is the slow choice and the safe one. The mutated text is served
// by a `load` hook and never written to disk (see `mutantVitestConfig.ts`), so an interrupt at any moment
// leaves the tree exactly as it was — which matters in a repo where an agent may be committing concurrently.
// The alternative, a persistent runner that rewrites files between runs, is several times faster and can
// leave corrupted source behind on a hard kill. Wall-clock is bought back with parallelism instead.

/** What every mutant run for one package shares: the package, and the vitest pool its suite passes under. */
interface Harness {
  packageName: string;
  pool: string;
}

export interface MutantRun {
  applied: boolean;
  output: string;
  passed: boolean;
  timedOut: boolean;
}

// Tried in order; the first whose unmutated suite passes is the one every mutant runs under. See
// `chooseBaseline`.
const MUTANT_POOLS = ['threads', 'forks'];

const MUTANT_TIMEOUT_MS = 120_000;

const scriptsDirectory = resolve(fileURLToPath(import.meta.url), '..');
const repoRoot = resolve(scriptsDirectory, '..');
const mutantConfigPath = resolve(scriptsDirectory, 'mutantVitestConfig.ts');
const mutantWorkerPath = resolve(scriptsDirectory, 'mutantWorker.ts');
const vitestBinary = resolve(repoRoot, 'node_modules/vitest/vitest.mjs');
const tsxBinary = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');

/**
 * The refusal for a selector that resolved to more than one package.
 *
 * The shared selector is a SUBSTRING match, so a word that reads like one package's name quietly fans out
 * over its whole family: `text` resolves to thirteen packages, `scene` to twelve, a bare `e` to ninety-eight.
 * For the other quality scripts that fan-out is the feature — they are seconds per package. Here a package is
 * minutes, so the same keystroke that means "check this package" becomes an unannounced hour, and the cost
 * lands after the run is already going. Every other refusal in this tool exists because a wrong number would
 * otherwise be believed; this one exists because a right number would otherwise arrive too late to want.
 *
 * Naming the matches rather than the count is the point: the reason `text` is thirteen packages is only
 * obvious once `textinput` and `textshaper-canvas` are on screen next to it.
 */
export function explainOverbroadSelection(selectors: readonly string[], packages: readonly string[]): string {
  const named = selectors.map((selector) => `'${selector}'`).join(', ');
  const shown = packages.slice(0, 8).join(', ');
  const rest = packages.length > 8 ? `, and ${packages.length - 8} more` : '';
  // The example path uses the package the selector names EXACTLY when there is one, because that is the one
  // the user meant — `text` fans out to thirteen, but they typed the name of a real package and suggesting
  // `bitmaptext` (merely alphabetically first) would read as the tool having misunderstood them.
  const suggested = packages.find((name) => selectors.some((selector) => name === selector)) ?? packages[0];
  return [
    pc.red(`unchecked: ${named} matches ${packages.length} packages — mutation testing runs one at a time.`),
    pc.dim(`  ${shown}${rest}`),
    pc.dim(`  Name one, or narrow to a file: \`npm run unchecked packages/${suggested}/src/<file>.ts\`.`),
  ].join('\n');
}

/** The sibling `*.test.ts` for a source file — the colocated test the repo's testing convention guarantees. */
export function getSiblingTestPath(sourcePath: string): string {
  return sourcePath.replace(/\.tsx?$/, (extension) => `.test${extension}`);
}

/**
 * The verdict for one completed mutant run.
 *
 * A run that never applied the mutant is `unreached` whatever its exit code, because a passing suite that
 * was never mutated is indistinguishable from a killed mutant by status alone. That test comes FIRST, and
 * a timeout does not override it: the marker is written by the `load` hook, so it always precedes anything
 * the module could do — a hang with no marker is the harness hanging before it reached the subject, which
 * is not evidence about any test. A timeout that DID apply counts as killed; a mutant that makes the code
 * stop terminating is one the tests noticed, in the bluntest possible way.
 */
export function readMutantVerdict(run: Readonly<MutantRun>): MutantOutcome['verdict'] {
  if (!run.applied) return 'unreached';
  if (run.timedOut) return 'killed';
  return run.passed ? 'survived' : 'killed';
}

function collectSourceFiles(packageName: string): string[] {
  const sourceRoot = join(repoRoot, 'packages', packageName, 'src');
  if (!existsSync(sourceRoot)) return [];
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx') || entry.name.endsWith('.d.ts')) continue;
      files.push(relative(repoRoot, entryPath).replaceAll('\\', '/'));
    }
  };
  walk(sourceRoot);
  return files.sort();
}

// Threads first, forks as the fallback, chosen by which one the unmutated suite passes under. Threads is
// roughly twice as fast per run and the cost is paid once per mutant, so it is worth trying — but a package
// that needs real process isolation exists, and the way to find out is to run its suite rather than to guess
// from its config. Whichever pool the control passed under is the one every mutant runs under.
function chooseBaseline(packageName: string): ReturnType<typeof measureBaseline> & { pool: string } {
  let last = { executed: new Map<string, Set<number>>(), green: false, pool: MUTANT_POOLS[0] as string };
  for (const pool of MUTANT_POOLS) {
    last = { ...measureBaseline(packageName, pool), pool };
    if (last.green) return last;
  }
  return last;
}

// The control run: the mutant harness with no edit in it, under one candidate pool.
//
// It goes through the SAME config, the same coverage settings, and the same pool as every mutant run, so
// control and treatment differ in exactly one thing — the spliced token. Measuring the baseline through the
// package's own config instead would leave the pool choice unverified, and a package that only passes under
// process isolation would then report every mutant as killed by a harness failure it never saw.
//
// Green is a precondition, not a result. A red suite fails on every mutant too, which reads as a perfect
// kill rate — the exact shape of a false all-clear.
function measureBaseline(packageName: string, pool: string): { executed: Map<string, Set<number>>; green: boolean } {
  const reportDirectory = mkdtempSync(join(tmpdir(), `unchecked-${packageName}-`));
  try {
    const result = spawnSync(
      process.execPath,
      [
        vitestBinary,
        'run',
        '--config',
        mutantConfigPath,
        `--pool=${pool}`,
        '--coverage',
        '--coverage.provider=v8',
        '--coverage.include=src/**/*.ts',
        '--coverage.exclude=**/*.test.ts',
        '--coverage.reporter=json',
        `--coverage.reportsDirectory=${reportDirectory}`,
        // Zeroed for the same reason `untested` zeroes them: the repository thresholds belong to
        // `test:coverage`, and inheriting them here would fail the baseline of a thin package before it
        // could be measured — reporting the tool's opinion of the package instead of the tests' reach.
        '--coverage.thresholds.branches=0',
        '--coverage.thresholds.functions=0',
        '--coverage.thresholds.lines=0',
        '--coverage.thresholds.statements=0',
      ],
      {
        cwd: join(repoRoot, 'packages', packageName),
        encoding: 'utf8',
        env: { ...process.env, [MUTANT_ENVIRONMENT]: JSON.stringify(nullMutantSpecification(packageName)) },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const executed = new Map<string, Set<number>>();
    const coverageFile = join(reportDirectory, 'coverage-final.json');
    if (existsSync(coverageFile)) {
      const coverage = JSON.parse(readFileSync(coverageFile, 'utf8')) as Record<
        string,
        Parameters<typeof collectExecutedLines>[0]
      >;
      for (const [absolute, fileCoverage] of Object.entries(coverage)) {
        executed.set(relative(repoRoot, absolute).replaceAll('\\', '/'), collectExecutedLines(fileCoverage));
      }
    }
    return { executed, green: result.status === 0 };
  } finally {
    rmSync(reportDirectory, { force: true, recursive: true });
  }
}

async function report(packageName: string, selectors: readonly string[], asJson: boolean): Promise<boolean> {
  const sources = filterPaths(collectSourceFiles(packageName), selectors);
  if (sources.length === 0) {
    console.error(pc.red(`unchecked: no source file under packages/${packageName}/src matches the selection.`));
    return false;
  }

  if (!asJson) console.log(pc.dim(`unchecked: measuring the unmutated baseline for @flighthq/${packageName}…`));
  const baseline = chooseBaseline(packageName);
  if (!baseline.green) {
    console.error(
      pc.red(`unchecked: @flighthq/${packageName}'s own suite fails before any mutation — nothing here is measurable.`),
    );
    console.error(pc.dim(`  Every mutant would "die" against a suite that was already red. Fix the suite first.`));
    return false;
  }
  if (baseline.executed.size === 0) {
    console.error(pc.red(`unchecked: coverage reported on no source file under packages/${packageName}/src.`));
    return false;
  }

  const planned = sources.map((path) => {
    const absolute = join(repoRoot, path);
    const mutants = planMutants(absolute, readFileSync(absolute, 'utf8'));
    const reachable = selectReachableMutants(mutants, baseline.executed.get(path) ?? new Set());
    return { mutants, path, reachable };
  });

  const runnable = planned.filter(
    (file) => file.reachable.length > 0 && existsSync(join(repoRoot, getSiblingTestPath(file.path))),
  );
  const untestable = planned.filter(
    (file) => file.reachable.length > 0 && !existsSync(join(repoRoot, getSiblingTestPath(file.path))),
  );
  const total = runnable.reduce((sum, file) => sum + file.reachable.length, 0);
  // Deliberately not called "unreached": that word is a VERDICT, meaning the harness failed to apply a
  // mutant it ran. These were never run at all, because no test executes their line. Two different facts,
  // and conflating them in the report would hide harness failures inside an expected number.
  const unexecutedTotal = planned.reduce((sum, file) => sum + (file.mutants.length - file.reachable.length), 0);

  if (!asJson) {
    console.log(
      pc.bold(`unchecked — @flighthq/${packageName}`) +
        pc.dim(` · ${total} reachable mutants across ${runnable.length} files`),
    );
    if (unexecutedTotal > 0) {
      console.log(pc.dim(`  ${unexecutedTotal} more sit on lines no test executed — those are \`npm run untested\`.`));
    }
    for (const file of untestable) {
      console.log(pc.yellow(`  ${file.path} has ${file.reachable.length} mutants and no sibling test file — skipped.`));
    }
    console.log();
  }

  const harness: Harness = { packageName, pool: baseline.pool };
  const files: UncheckedFile[] = [];
  for (const file of runnable) {
    const outcomes = await runFileMutants(harness, file.path, file.reachable, asJson);
    const survivors = outcomes.filter((outcome) => outcome.verdict === 'survived');
    const unreached = outcomes.filter((outcome) => outcome.verdict === 'unreached').length;
    files.push({ path: file.path, survivors, total: file.mutants.length, unreached });
  }

  if (asJson) {
    console.log(JSON.stringify({ files: rankUncheckedFiles(files), package: packageName }, null, 2));
    return true;
  }
  printReport(packageName, files, total);
  return true;
}

function printReport(packageName: string, files: readonly UncheckedFile[], total: number): void {
  const survivorCount = files.reduce((sum, file) => sum + file.survivors.length, 0);
  const unreachedCount = files.reduce((sum, file) => sum + file.unreached, 0);

  console.log();
  console.log(pc.bold(`unchecked — @flighthq/${packageName}`));
  if (survivorCount === 0) {
    console.log(`Every one of the ${total} reachable mutants was killed by a test.`);
    console.log(pc.dim(KILLED_IS_NOT_VERIFIED));
    return;
  }
  console.log(
    `${survivorCount} of ${total} reachable mutants survived, in ${files.filter((f) => f.survivors.length > 0).length} files.\n`,
  );

  // Two lines per survivor, matching `npm run untested`'s shape: the source as written, then the edit that
  // went unnoticed under it. The pair is what makes a finding readable without opening the file, and the
  // `line:column` is what distinguishes several identical edits on one line from one edit printed twice.
  for (const file of rankUncheckedFiles(files)) {
    if (file.survivors.length === 0) continue;
    const lines = readFileSync(join(repoRoot, file.path), 'utf8').split('\n');
    const width = String(Math.max(...file.survivors.map((outcome) => outcome.mutant.line))).length;
    console.log(`${pc.cyan(file.path)} ${pc.dim(`— ${file.survivors.length}`)}`);
    for (const outcome of file.survivors) {
      const { column, line, operator, original, replacement } = outcome.mutant;
      const edit = replacement === '' ? `${original} → (deleted)` : `${original} → ${replacement}`;
      console.log(`  ${pc.dim(String(line).padStart(width))} │ ${(lines[line - 1] ?? '').trim()}`);
      console.log(`  ${' '.repeat(width)} ${pc.dim(`└ col ${column} · ${edit} · ${operator}`)}`);
    }
    console.log();
  }

  if (unreachedCount > 0) {
    console.log(pc.yellow(`${unreachedCount} mutants recorded no verdict — their module was never loaded by the run.`));
    console.log(pc.dim('  That is a harness result, not a test result, and is excluded from the list above.'));
  }
  console.log(pc.dim(SURVIVOR_IS_NOT_A_DEFECT));
  console.log(pc.dim(KILLED_IS_NOT_VERIFIED));
}

// Sibling test first, whole package only for what survives it. The sibling run is the cheaper and the more
// specific question — the colocated test is the one that owes this file its coverage — and it settles the
// large majority. Escalating only the survivors keeps the expensive full-suite run proportional to the
// interesting set, while making sure nothing is reported as unkilled that another test in the package kills.
async function runFileMutants(
  harness: Readonly<Harness>,
  sourcePath: string,
  mutants: readonly Mutant[],
  quiet: boolean,
): Promise<MutantOutcome[]> {
  const siblingTest = join(repoRoot, getSiblingTestPath(sourcePath));
  if (!quiet) process.stdout.write(pc.dim(`  ${sourcePath} · ${mutants.length} mutants `));

  const siblingOutcomes = await runTier(harness, sourcePath, mutants, [siblingTest], quiet, 'sibling');

  const escalated = siblingOutcomes.filter((outcome) => outcome.verdict === 'survived').map((o) => o.mutant);
  if (escalated.length === 0) {
    if (!quiet) console.log();
    return siblingOutcomes;
  }
  if (!quiet) process.stdout.write(pc.dim(` escalating ${escalated.length} `));

  const packageOutcomes = await runTier(harness, sourcePath, escalated, [], quiet, 'package');
  if (!quiet) console.log();

  const confirmed = new Map(packageOutcomes.map((outcome) => [outcome.mutant, outcome]));
  return siblingOutcomes.map((outcome) => confirmed.get(outcome.mutant) ?? outcome);
}

// One tier of one file, through a pool of warm workers.
//
// Every mutant that the pool could not settle — a worker that hung, crashed, or died mid-request — is re-run
// afterwards through the original spawn-per-mutant path. That fallback is the whole reason batching is safe
// to adopt: a mutant that takes down a shared server costs a slower second attempt instead of a wrong
// verdict, so the failure mode of the optimization is latency, never a corrupted finding.
async function runTier(
  harness: Readonly<Harness>,
  sourcePath: string,
  mutants: readonly Mutant[],
  targets: readonly string[],
  quiet: boolean,
  scope: MutantOutcome['scope'],
): Promise<MutantOutcome[]> {
  const packageRoot = join(repoRoot, 'packages', harness.packageName);
  const subject = join(repoRoot, sourcePath);
  const pool = createMutantPool(packageRoot, subject, Math.min(workerCount(), mutants.length));
  const fallbacks: Mutant[] = [];

  const outcomes = await mapConcurrent(mutants, pool.size, async (mutant) => {
    const run = await pool.run(mutant, targets);
    if (run === null) {
      fallbacks.push(mutant);
      return null;
    }
    if (!quiet) process.stdout.write(progressMark(run));
    return { mutant, scope, verdict: readMutantVerdict(run) };
  });
  pool.close();

  const settled = outcomes.filter((outcome): outcome is MutantOutcome => outcome !== null);
  if (fallbacks.length === 0) return settled;

  if (!quiet) process.stdout.write(pc.yellow(`↻${fallbacks.length}`));
  const retried = await mapConcurrent(fallbacks, workerCount(), async (mutant) => {
    const run = await runMutant(harness, sourcePath, mutant, targetsRelativeTo(packageRoot, targets));
    if (!quiet) process.stdout.write(progressMark(run));
    return { mutant, scope, verdict: readMutantVerdict(run) };
  });
  return [...settled, ...retried];
}

function targetsRelativeTo(packageRoot: string, targets: readonly string[]): string[] {
  return targets.map((target) => relative(packageRoot, target).replaceAll('\\', '/'));
}

// One vitest process, one mutant, nothing written to the tree. `targets` empty means the package's whole
// include glob — the escalation tier.
//
// `--maxWorkers=1` because the outer loop already saturates the machine. Vitest's pool sizes itself to the
// core count, so eight concurrent runs at default settings measured a hundred and twenty worker processes on
// sixteen cores; every run then contends with every other, and runs start hitting the timeout — which this
// tool would record as kills.
function runMutant(
  harness: Readonly<Harness>,
  sourcePath: string,
  mutant: Readonly<Mutant>,
  targets: readonly string[],
): Promise<MutantRun> {
  const specification = {
    end: mutant.end,
    filePath: join(repoRoot, sourcePath),
    packageName: harness.packageName,
    replacement: mutant.replacement,
    start: mutant.start,
  };

  return new Promise((settle) => {
    const child = spawn(
      process.execPath,
      [vitestBinary, 'run', '--config', mutantConfigPath, `--pool=${harness.pool}`, '--maxWorkers=1', ...targets],
      {
        cwd: join(repoRoot, 'packages', harness.packageName),
        env: { ...process.env, [MUTANT_ENVIRONMENT]: JSON.stringify(specification) },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let output = '';
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, MUTANT_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      settle({ applied: output.includes(APPLIED_MARKER), output, passed: code === 0, timedOut });
    });
  });
}

/**
 * A pool of warm mutant workers over one source file.
 *
 * `run` returns `null` rather than a verdict when the worker could not settle the mutant — a hang, a crash,
 * a server that died. That is deliberately not a verdict: the caller re-runs those in a fresh process. A
 * pool that guessed `killed` for its own failures would report the exact false all-clear this tool is built
 * to avoid, and it would be indistinguishable from a real kill in the output.
 */
function createMutantPool(packageRoot: string, subject: string, size: number) {
  const idle: MutantWorker[] = [];
  let live = 0;
  let closed = false;

  const acquire = (): MutantWorker => {
    const existing = idle.pop();
    if (existing !== undefined) return existing;
    live += 1;
    return startMutantWorker(packageRoot, subject);
  };

  return {
    close(): void {
      closed = true;
      for (const worker of idle.splice(0)) worker.kill();
    },
    async run(mutant: Readonly<Mutant>, targets: readonly string[]): Promise<MutantRun | null> {
      if (closed) return null;
      const worker = acquire();
      const run = await worker.request({
        end: mutant.end,
        id: worker.nextId(),
        replacement: mutant.replacement,
        start: mutant.start,
        targets,
      });
      // A worker that failed a request is not reused: whatever state took it down is still in it, and the
      // next mutant's verdict would be about that rather than about the tests.
      if (run === null) {
        worker.kill();
        live -= 1;
        return null;
      }
      if (closed) worker.kill();
      else idle.push(worker);
      return run;
    },
    get size(): number {
      return Math.max(1, size);
    },
  };
}

interface MutantWorker {
  kill(): void;
  nextId(): number;
  request(payload: MutantRequest): Promise<MutantRun | null>;
}

function startMutantWorker(packageRoot: string, subject: string): MutantWorker {
  const child = spawn(process.execPath, [tsxBinary, mutantWorkerPath, packageRoot, subject], {
    cwd: packageRoot,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffered = '';
  let counter = 0;
  let dead = false;
  let pending: ((response: MutantResponse | null) => void) | null = null;

  const settle = (response: MutantResponse | null): void => {
    const waiting = pending;
    pending = null;
    waiting?.(response);
  };

  child.stdout.on('data', (chunk: Buffer) => {
    buffered += chunk.toString();
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      const marker = line.indexOf(WORKER_PROTOCOL_PREFIX);
      if (marker >= 0) settle(JSON.parse(line.slice(marker + WORKER_PROTOCOL_PREFIX.length)) as MutantResponse);
      newline = buffered.indexOf('\n');
    }
  });
  // Drained and discarded. Vitest reports errors here, and a full stderr pipe would deadlock the worker.
  child.stderr.on('data', () => {});
  child.on('close', () => {
    dead = true;
    settle(null);
  });
  child.on('error', () => {
    dead = true;
    settle(null);
  });

  return {
    kill(): void {
      dead = true;
      child.kill('SIGKILL');
    },
    nextId(): number {
      counter += 1;
      return counter;
    },
    request(payload: MutantRequest): Promise<MutantRun | null> {
      if (dead) return Promise.resolve(null);
      return new Promise((resolve) => {
        const timer = setTimeout(() => settle(null), MUTANT_TIMEOUT_MS);
        pending = (response) => {
          clearTimeout(timer);
          if (response === null || response.id !== payload.id) resolve(null);
          else resolve({ applied: response.applied, output: '', passed: response.passed, timedOut: false });
        };
        child.stdin.write(`${JSON.stringify(payload)}\n`);
      });
    },
  };
}

async function mapConcurrent<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

// A no-op spec for the control run: a path nothing resolves to, and an identity splice even if it somehow
// did. The env variable must be present because the config refuses to run without it, and that refusal is
// what stops this config from being reached by anything except this tool.
function nullMutantSpecification(packageName: string): Record<string, unknown> {
  return {
    end: 0,
    filePath: join(repoRoot, 'packages', packageName, 'src', ' no-mutant'),
    packageName,
    replacement: '',
    start: 0,
  };
}

// Green for a kill, red for a survivor — the colors of the finding, not of the process exit. A run that
// never applied its mutant measured nothing and gets neither.
function progressMark(run: Readonly<MutantRun>): string {
  const verdict = readMutantVerdict(run);
  if (verdict === 'unreached') return pc.yellow('?');
  return verdict === 'killed' ? pc.green('·') : pc.red('·');
}

// Vitest spawns its own pool inside each of these, so the useful ceiling is well under the core count;
// oversubscribing turns every run into a timeout candidate and makes the timeout tier meaningless.
function workerCount(): number {
  return Math.max(1, Math.min(8, availableParallelism() - 1));
}

const KILLED_IS_NOT_VERIFIED = 'A kill means some test NOTICED the edit, not that the test is a good one.';
const SURVIVOR_IS_NOT_A_DEFECT =
  'A survivor is an address to go and read. Some are equivalent mutants no test could ever kill.';

async function main(): Promise<void> {
  const selectors = getSelectors();
  const asJson = process.argv.includes('--json');
  // Per-package, like `untested`, and for the same reason: a whole-repo sweep would pay one vitest startup
  // per mutant across 149 packages. Name where you are working.
  if (selectors.length === 0) {
    console.error(pc.red('unchecked: name a file or package — `npm run unchecked geometry/src/plane.ts`.'));
    process.exit(1);
  }

  const packages = selectPackages(selectors);
  if (packages.length === 0) {
    console.error(pc.red(`unchecked: no package matches ${selectors.map((selector) => `'${selector}'`).join(', ')}.`));
    process.exit(1);
  }
  if (packages.length > 1) {
    console.error(explainOverbroadSelection(selectors, packages));
    process.exit(1);
  }

  // Findings never fail the run — the list is the product. A nonzero exit here means the measurement itself
  // could not be made.
  if (!(await report(packages[0] as string, selectors, asJson))) process.exit(1);
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) await main();
