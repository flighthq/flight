import { parseSync } from 'oxc-parser';

// The mutation engine behind `npm run unchecked`: everything that can be decided from source text alone,
// with no filesystem, no child process, and no vitest. Split from the runner so the part that decides WHAT
// a mutant is can be asserted directly, rather than inferred from the exit code of a suite it drove.
//
// A mutant is a single-token edit that changes what the code DOES. `<` becomes `<=`, `&&` becomes `||`,
// `!x` becomes `x`. If the package's tests still pass with that edit in place, no test distinguishes the
// real behavior from the broken one — which is the question coverage cannot answer and this can.
//
// WHAT A SURVIVOR IS NOT. It is not automatically a missing test. Some mutants are EQUIVALENT: the edit
// changes the source without changing observable behavior, so no test could ever kill them, and no amount
// of test writing will. `Math.max(a, b)` guarded by `a > b` versus `a >= b` differs only when `a === b`,
// and if the caller cannot tell those apart the mutant is unkillable by construction. Equivalent-mutant
// detection is undecidable in general and this makes no attempt at it, so the survivor list is a list of
// places to LOOK, in the same spirit as `npm run untested` — never a defect count, and never a score.

export type MutationOperator =
  | 'arithmetic'
  | 'assignment'
  | 'boolean'
  | 'equality'
  | 'logical'
  | 'relational'
  | 'unary'
  | 'update';

export interface Mutant {
  /**
   * One-based column of `start`.
   *
   * Carried for the report, not for the splice. One line can hold several mutants with the same edit —
   * `{ a: a ?? 0, b: b ?? 0, c: c ?? 0 }` yields three identical `?? → ||` rows — and without a column the
   * reader cannot tell four findings from one printed four times.
   */
  column: number;
  /** Zero-based offset one past the last replaced character. */
  end: number;
  /** One-based line of `start`, for reporting. */
  line: number;
  operator: MutationOperator;
  /** Verbatim replaced source, so a report can show the edit without re-reading the file. */
  original: string;
  replacement: string;
  /** Zero-based offset of the first replaced character. */
  start: number;
}

/**
 * Killed — some test failed, so the tests distinguish this edit from the real code.
 * Survived — every test still passed with the edit in place.
 * Unreached — the mutated module was never loaded by the run, so nothing was measured.
 */
export type MutantVerdict = 'killed' | 'survived' | 'unreached';

export interface MutantOutcome {
  mutant: Mutant;
  /** The tier that produced the verdict: the file's own sibling test, or the whole package suite. */
  scope: 'package' | 'sibling';
  verdict: MutantVerdict;
}

export interface UncheckedFile {
  /** Repo-relative, forward-slashed. */
  path: string;
  survivors: readonly MutantOutcome[];
  /** Every mutant planned for the file, including the ones never run. */
  total: number;
  unreached: number;
}

/** One mutant handed to a warm worker: the splice, the file it applies to, and the tests to run it against. */
export interface MutantRequest {
  end: number;
  /** Absolute path of the source file being mutated. Per request, so one worker serves a whole package. */
  filePath: string;
  /** Correlates the response, so a worker's replies cannot be misattributed after a restart. */
  id: number;
  replacement: string;
  start: number;
  /** Absolute test file paths, or empty for the package's own include glob (the escalation tier). */
  targets: readonly string[];
}

/** A warm worker's verdict inputs for one request. `applied` is the instrument check, not a status. */
export interface MutantResponse {
  applied: boolean;
  id: number;
  passed: boolean;
}

/**
 * What each of a package's test files executes when it runs on its own: test path → source path → lines.
 *
 * Paths are repo-relative and forward-slashed, matching every other path this tool reports.
 */
export type TestCoverageProfile = ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<number>>>;

/** How the escalation tier spends its runs once a coverage profile says which tests could matter at all. */
export interface EscalationPlan {
  /**
   * Mutants no test outside the sibling executes, which need no run: the sibling's `survived` already holds
   * package-wide. This is the entire saving, and on `geometry/src/plane.ts` it is 18 of 19.
   */
  settled: Mutant[];
  /** The rest, each with the tests that do execute its line — a handful of files instead of the suite. */
  targeted: { mutant: Mutant; targets: string[] }[];
}

/**
 * The line the runner requires on a mutant run's stderr before it will believe any verdict.
 *
 * This is the instrument check. A `load` hook that never fires leaves the tests running against UNMUTATED
 * source and passing, which by exit code alone is identical to a killed mutant — the failure mode where a
 * broken harness reports a clean bill of health for tests it never challenged. Absence of this line
 * downgrades the run to `unreached` rather than letting it count either way.
 */
export const APPLIED_MARKER = 'flight-unchecked: mutant applied';

/** The environment variable carrying the JSON mutant spec from the runner into the vitest config. */
export const MUTANT_ENVIRONMENT = 'FLIGHT_UNCHECKED_MUTANT';

/**
 * Marks a warm worker's protocol lines on a stdout it does not own.
 *
 * Vitest writes its own watch-mode banners to the same stream, so a reply has to be recognizable rather than
 * merely well-formed — scanning for "a line that parses as JSON" would eventually pick up something vitest
 * printed and attribute a verdict to it.
 */
export const WORKER_PROTOCOL_PREFIX = '@@flight-unchecked@@';

/** The source text with one mutant spliced in. Offsets are the mutant's, against this exact text. */
export function applyMutantText(
  source: string,
  mutant: Readonly<Pick<Mutant, 'end' | 'replacement' | 'start'>>,
): string {
  return source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end);
}

/**
 * The lines any test executed, from one file's entry in an istanbul-shaped v8 coverage report.
 *
 * Mutants on lines nothing executed are not worth a vitest process: they survive by construction, and
 * `npm run untested` already lists that hole with no mutation run at all. Filtering them out is what keeps
 * the survivor list about tests that RAN and failed to notice, rather than re-reporting absent tests.
 */
export function collectExecutedLines(coverage: Readonly<StatementCoverage>): Set<number> {
  const lines = new Set<number>();
  for (const [id, count] of Object.entries(coverage.s)) {
    if (count === 0) continue;
    const entry = coverage.statementMap[id];
    const start = entry?.start?.line;
    const end = entry?.end?.line ?? start;
    if (typeof start !== 'number') continue;
    for (let line = start; line <= (typeof end === 'number' ? end : start); line += 1) lines.add(line);
  }
  return lines;
}

/** The one-based line and column containing `offset` — the address a reader uses to find the mutant. */
export function getPositionAtOffset(source: string, offset: number): { column: number; line: number } {
  let column = 1;
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === '\n') {
      column = 1;
      line += 1;
      continue;
    }
    column += 1;
  }
  return { column, line };
}

/**
 * Whether a coverage profile accounts for everything the whole-suite baseline saw in one source file.
 *
 * The profile is only usable as an argument about what CANNOT kill a mutant, and that argument collapses the
 * moment attribution is incomplete. A line the full suite executed but no test file executed on its own means
 * some path is unaccounted for — cross-test state is the usual cause — and skipping escalation on that basis
 * would hide a real killer. The check is cheap and the fallback is the whole-suite tier this replaces, so an
 * incomplete profile costs time rather than correctness.
 */
export function isTestCoverageProfileComplete(
  profile: TestCoverageProfile,
  sourcePath: string,
  executedLines: ReadonlySet<number>,
): boolean {
  const attributed = new Set<number>();
  for (const executed of profile.values()) {
    for (const line of executed.get(sourcePath) ?? []) attributed.add(line);
  }
  for (const line of executedLines) {
    if (!attributed.has(line)) return false;
  }
  return true;
}

/**
 * Which tests each escalated mutant actually has to run against.
 *
 * The escalation tier asks one question — does any test OTHER than this file's own kill it? — and used to
 * answer it by running the package's entire suite once per mutant. A coverage profile answers most of it
 * without running anything: a test that never executes the mutated line executes an identical program whether
 * that line is mutated or not, because the edit is one token at one location and a trace that never reaches
 * that location is the same trace either way. It cannot fail because of the mutation, so it cannot kill it.
 *
 * The argument is exact rather than heuristic, but it rests on the profile being complete — the caller must
 * check `isTestCoverageProfileComplete` first. Line attribution errs toward marking MORE lines executed than
 * a statement really touches, which points the wrong way for cost and the right way for safety: an
 * over-marked line adds a run, it never removes one.
 *
 * The sibling test is excluded because it has already returned its verdict, and re-running it can only
 * confirm the survival it just reported.
 */
export function planEscalation(
  profile: TestCoverageProfile,
  sourcePath: string,
  siblingTestPath: string,
  mutants: readonly Mutant[],
): EscalationPlan {
  const plan: EscalationPlan = { settled: [], targeted: [] };
  for (const mutant of mutants) {
    const targets: string[] = [];
    for (const [testPath, executed] of profile) {
      if (testPath === siblingTestPath) continue;
      if (executed.get(sourcePath)?.has(mutant.line) === true) targets.push(testPath);
    }
    if (targets.length === 0) plan.settled.push(mutant);
    else plan.targeted.push({ mutant, targets: targets.sort() });
  }
  return plan;
}

/**
 * Every mutant one source file admits, ordered by position.
 *
 * Operators are the standard replacement families — relational (ROR), arithmetic (AOR), logical (LCR),
 * equality, assignment, update, unary deletion (UOD), and boolean literal — chosen because each one is a
 * defect a reader would recognize on sight in a diff. Statement and return-value deletion are deliberately
 * absent: they generate the most mutants and the most equivalents, and a list nobody finishes reading has
 * the same value as no list.
 *
 * Type syntax is never mutated. A `TS*` subtree is erased before the code runs, so an edit inside one
 * either changes nothing at runtime or fails to compile — neither of which says anything about the tests.
 */
export function planMutants(filePath: string, source: string): Mutant[] {
  const { errors, program } = parseSync(filePath, source, {
    lang: filePath.endsWith('.tsx') ? 'tsx' : 'ts',
    sourceType: 'module',
  });
  if (errors.length > 0) throw new Error(`Could not parse ${filePath}: ${errors[0]?.message ?? 'unknown parse error'}`);

  const mutants: Mutant[] = [];
  visit(program, (node) => collectNodeMutants(source, node, mutants));
  return mutants
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((mutant) => parses(filePath, source, mutant));
}

/** Weakest first, matching `npm run untested` and the package TODO index: most survivors is most worth opening. */
export function rankUncheckedFiles(files: readonly UncheckedFile[]): UncheckedFile[] {
  return [...files].sort((a, b) => b.survivors.length - a.survivors.length || a.path.localeCompare(b.path));
}

/**
 * What one warm-worker run measured, read only from the test files that run was asked to execute.
 *
 * A warm server's state ACCUMULATES: it still holds the result of every earlier run, and filtering by the
 * paths this run named is the only thing keeping those out of the verdict. A worker that killed a mutant
 * against one test file and is then asked about a different scope carries that failure forward, and reading
 * its state unfiltered turns it into a kill for a mutant no failing test ever ran against. A false kill is
 * the one error this tool cannot absorb: a survivor wrongly reported dead vanishes from the list, leaving
 * nothing behind to notice it by — the clean bill of health the instrument checks exist to prevent.
 *
 * `measured` is false when a file the run named produced no result at all. That is neither a pass nor a
 * failure but the absence of evidence, and the caller reports it as `unreached` rather than guessing.
 */
export function readMutantRunResult(
  paths: readonly string[],
  files: readonly Readonly<{ filepath: string; result?: Readonly<{ state?: string }> }>[],
): { measured: boolean; passed: boolean } {
  const named = files.filter((file) => paths.includes(file.filepath));
  const measured = paths.length > 0 && paths.every((path) => named.some((file) => file.filepath === path));
  return { measured, passed: measured && !named.some((file) => file.result?.state === 'fail') };
}

/** The mutants worth spending a process on: those on a line some test actually executed. */
export function selectReachableMutants(mutants: readonly Mutant[], executedLines: ReadonlySet<number>): Mutant[] {
  return mutants.filter((mutant) => executedLines.has(mutant.line));
}

interface OxcNode {
  [key: string]: unknown;
  end: number;
  start: number;
  type: string;
}

interface StatementCoverage {
  s: Record<string, number>;
  statementMap: Record<string, { end?: { line?: number } | null; start?: { line?: number } | null }>;
}

const ARITHMETIC_REPLACEMENTS: Record<string, string> = { '%': '*', '*': '/', '+': '-', '-': '+', '/': '*' };

const ASSIGNMENT_REPLACEMENTS: Record<string, string> = {
  '%=': '*=',
  '&&=': '||=',
  '*=': '/=',
  '+=': '-=',
  '-=': '+=',
  '/=': '*=',
  '??=': '||=',
  '||=': '&&=',
};

const EQUALITY_REPLACEMENTS: Record<string, string> = { '!=': '==', '!==': '===', '==': '!=', '===': '!==' };

const LOGICAL_REPLACEMENTS: Record<string, string> = { '&&': '||', '??': '||', '||': '&&' };

// Boundary shifts only. A direction flip (`<` to `>`) is caught by almost any test that exercises the
// comparison at all, so it costs a process to confirm what the suite already proves; the off-by-one is the
// edit that slips through a test asserting only well-separated values.
const RELATIONAL_REPLACEMENTS: Record<string, string> = { '<': '<=', '<=': '<', '>': '>=', '>=': '>' };

// The `TS*` nodes that wrap runtime code rather than describing a type. See `visit`.
const TS_EXPRESSION_WRAPPERS = new Set([
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

// Deleted, not replaced. `!x` becoming `x` is the classic unary-operator-deletion mutant, and the negation
// is where guard clauses invert. `typeof`, `void`, and `delete` are excluded: removing them changes the
// expression's type rather than its logic, so a kill proves nothing about the behavior under test.
const UNARY_DELETIONS = new Set(['!', '+', '-', '~']);

const UPDATE_REPLACEMENTS: Record<string, string> = { '++': '--', '--': '++' };

function collectNodeMutants(source: string, node: Readonly<OxcNode>, mutants: Mutant[]): void {
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression' || node.type === 'AssignmentExpression') {
    const operator = typeof node.operator === 'string' ? node.operator : '';
    const family = getBinaryFamily(node.type, operator);
    if (family === null) return;
    const left = node.left as OxcNode | undefined;
    const right = node.right as OxcNode | undefined;
    if (left === undefined || right === undefined) return;
    const offset = findOperatorOffset(source, left.end, right.start, operator);
    if (offset < 0) return;
    mutants.push(makeMutant(source, offset, offset + operator.length, family.replacement, family.operator));
    return;
  }

  if (node.type === 'UnaryExpression') {
    const operator = typeof node.operator === 'string' ? node.operator : '';
    if (!UNARY_DELETIONS.has(operator)) return;
    const argument = node.argument as OxcNode | undefined;
    if (argument === undefined) return;
    const offset = findOperatorOffset(source, node.start, argument.start, operator);
    if (offset < 0) return;
    mutants.push(makeMutant(source, offset, offset + operator.length, '', 'unary'));
    return;
  }

  if (node.type === 'UpdateExpression') {
    const operator = typeof node.operator === 'string' ? node.operator : '';
    const replacement = UPDATE_REPLACEMENTS[operator];
    if (replacement === undefined) return;
    const argument = node.argument as OxcNode | undefined;
    if (argument === undefined) return;
    // Prefix and postfix put the token on opposite sides of the argument; search whichever gap is real.
    const prefix = node.start < argument.start;
    const from = prefix ? node.start : argument.end;
    const to = prefix ? argument.start : node.end;
    const offset = findOperatorOffset(source, from, to, operator);
    if (offset < 0) return;
    mutants.push(makeMutant(source, offset, offset + operator.length, replacement, 'update'));
    return;
  }

  if (node.type === 'Literal' && (node.value === true || node.value === false) && node.raw !== undefined) {
    // `raw` guards against a non-source literal; `true`/`false` have no other spelling, so an exact match
    // is available and anything else is left alone rather than guessed at.
    const raw = String(node.raw);
    if (raw !== 'true' && raw !== 'false') return;
    mutants.push(makeMutant(source, node.start, node.end, raw === 'true' ? 'false' : 'true', 'boolean'));
  }
}

// The operator token's offset, scanning only real code: comments in the gap are skipped so `a /* > */ >= b`
// cannot splice a replacement into a comment. Returns -1 when the token is not found, and the caller drops
// the mutant — a mutant at a guessed offset would produce a verdict about text nobody wrote.
function findOperatorOffset(source: string, from: number, to: number, operator: string): number {
  if (operator.length === 0) return -1;
  let index = from;
  while (index < to) {
    if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index);
      index = newline < 0 || newline > to ? to : newline + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const close = source.indexOf('*/', index + 2);
      index = close < 0 || close > to ? to : close + 2;
      continue;
    }
    if (source.startsWith(operator, index)) return index;
    index += 1;
  }
  return -1;
}

function getBinaryFamily(type: string, operator: string): { operator: MutationOperator; replacement: string } | null {
  if (type === 'AssignmentExpression') {
    const replacement = ASSIGNMENT_REPLACEMENTS[operator];
    return replacement === undefined ? null : { operator: 'assignment', replacement };
  }
  if (type === 'LogicalExpression') {
    const replacement = LOGICAL_REPLACEMENTS[operator];
    return replacement === undefined ? null : { operator: 'logical', replacement };
  }
  const equality = EQUALITY_REPLACEMENTS[operator];
  if (equality !== undefined) return { operator: 'equality', replacement: equality };
  const relational = RELATIONAL_REPLACEMENTS[operator];
  if (relational !== undefined) return { operator: 'relational', replacement: relational };
  const arithmetic = ARITHMETIC_REPLACEMENTS[operator];
  if (arithmetic !== undefined) return { operator: 'arithmetic', replacement: arithmetic };
  return null;
}

// Every mutant is re-parsed before it is handed out, so "the mutants all compile" is true by construction
// rather than by having enumerated the hazards correctly. This is the invariant the tool rests on: a mutant
// that does not parse fails its vitest run for a reason unrelated to the tests, and the runner records that
// as a KILL — so a generator bug shows up not as an error but as an unearned clean bill of health for the
// very lines it mangled.
//
// One case is known and there will be others: `??` cannot sit unparenthesized beside `||` or `&&`, so
// rewriting one `??` of `a ?? b ?? c` produces a syntax error. Rather than special-case the operator, the
// filter closes the whole class — including the ones nobody has hit yet.
//
// The cost is one parse per candidate, which is microseconds against the ~5 seconds each surviving mutant
// then spends in a vitest process.
function parses(filePath: string, source: string, mutant: Readonly<Mutant>): boolean {
  const { errors } = parseSync(filePath, applyMutantText(source, mutant), {
    lang: filePath.endsWith('.tsx') ? 'tsx' : 'ts',
    sourceType: 'module',
  });
  return errors.length === 0;
}

function makeMutant(
  source: string,
  start: number,
  end: number,
  replacement: string,
  operator: MutationOperator,
): Mutant {
  const { column, line } = getPositionAtOffset(source, start);
  return { column, end, line, operator, original: source.slice(start, end), replacement, start };
}

// A plain structural walk rather than oxc's visitor, so one predicate can prune whole subtrees. Type syntax
// is pruned rather than skipped: a type annotation's interior is full of `|`, `&`, and `true`/`false` that
// look mutable and are erased before anything runs.
//
// The wrappers above are the exception and must not be pruned. `(a + b) as number` is a `TSAsExpression`
// whose `expression` is live code; pruning every `TS*` node would silently drop every mutant behind a cast,
// and a file that casts often would report as thoroughly checked because most of it was never mutated. Their
// own type children are `TSType*` nodes, so the same rule prunes those one level down.
function visit(node: unknown, enter: (node: Readonly<OxcNode>) => void): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) visit(child, enter);
    return;
  }
  const candidate = node as Partial<OxcNode>;
  if (typeof candidate.type === 'string') {
    if (candidate.type.startsWith('TS') && !TS_EXPRESSION_WRAPPERS.has(candidate.type)) return;
    if (typeof candidate.start === 'number' && typeof candidate.end === 'number') enter(candidate as OxcNode);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    visit((node as Record<string, unknown>)[key], enter);
  }
}
