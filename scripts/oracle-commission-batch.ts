// The commissioning lead's CLI: gather every in-tree statement about each cell, apply the bar in
// `oracle-eligibility.ts`, and — only on `--write` — file the request and the coverage identity that
// together commission a batch (agents/render-oracle-repository.md §5, §7 step 1).
//
// ★ IT READS ONLY, UNLESS YOU ASK IT TO WRITE. The default is a report, because the decision this
// automates is irreversible in one direction: a blessed reference stands until someone re-commissions it,
// and every regression check in between agrees with it. Looking must therefore be cheaper than acting,
// and acting must be a separate word on the command line.
//
// ★ IT NEVER JUDGES A CELL ITSELF. Every condition it applies comes from a record something else
// produced — a capture status, a repeat run, the parity leg, the coverage manifest, the hold list. This
// process contributes no opinion, which is what makes its output auditable: each withheld cell names the
// record that withheld it, and each commissioned cell can be re-derived by re-reading the same files.
//
//   report  → print eligible and blocked cells, grouped by why  (default; writes nothing)
//   write   → additionally file oracle-requests/<id>.json and add the referenceImage coverage identities
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compareCalibrationRuns,
  deriveCalibrationIdentityVerdict,
  findDuplicateCalibrationRoot,
  readCaptureRootIdentity,
} from './oracle-calibrate';
import { readBoundOracleRequestTarget } from './oracle-candidate';
import type {
  OracleDeterminismScope,
  OracleCaptureFact,
  OracleDeterminismVerdict,
  OracleParityCheck,
  OracleParityWithholding,
} from './oracle-eligibility';
import {
  addReferenceImageCoverage,
  findParityWithholdings,
  findStaleCaptures,
  selectCommissionableCells,
  summarizeOracleBlocks,
} from './oracle-eligibility';
import type { OracleRequestCaptureIdentity, OracleRequestTarget } from './oracle-records';
import { getOracleRequestCells, readOracleLockPins, readOracleRequest } from './oracle-records';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const [subcommand = 'report', ...rest] = process.argv.slice(2);
if (subcommand !== 'report' && subcommand !== 'write') {
  console.error('usage: oracle-commission-batch <report|write> --runs <dir,dir>');
  console.error('       [--subject <name>] [--limit <n>] [--id <request-id>] [--reason <text>] [--frames <n>]');
  console.error('       [--only <entry,entry>] [--verbose]');
  process.exit(2);
}

const subject = readOption('--subject') ?? 'functional';
const runs = (readOption('--runs') ?? join(repoRoot, '.artifacts')).split(',').filter(Boolean);
const frames = Number.parseInt(readOption('--frames') ?? '1', 10);
// ★ A BOUND ON BATCH SIZE IS NOT A CONVENIENCE. `MAX_PENDING_DAYS` in oracle-check.ts is 14: every cell
// this files starts a clock, and a batch larger than the oracle repository can actually review and
// release inside that window turns green CI red on day 15 — for cells that were never wrong. The right
// size is set by review throughput, not by how many cells cleared the bar.
const limit = Number.parseInt(readOption('--limit') ?? '10', 10);
const only = new Set((readOption('--only') ?? '').split(',').filter(Boolean));

// ★ TWO RUNS MINIMUM, AND THE TOOL REFUSES RATHER THAN ASSUMING. Determinism is a required precondition,
// and one run cannot measure it. Accepting a single root would silently downgrade every cell's
// determinism to "unmeasured" — the report would still print, and the reader would have to notice that
// an entire condition had quietly gone missing.
if (runs.length < 2) {
  console.error(
    'oracle-commission-batch: --runs needs at least two capture roots; determinism is measured, not assumed',
  );
  console.error('  each root is a capture output directory (<subject>/<entry>/<renderer>/status.json)');
  process.exit(2);
}

// ★ TWO OF THE SAME ROOT IS ONE ROOT, AND IT SATISFIES THE COUNT ABOVE WITHOUT SATISFYING THE CONDITION.
// The check that matters is "were these produced independently", and a path typed twice answers it with a
// directory reproducing itself perfectly. The `write` path would refuse it later as `one-host` once the
// identities are read — but only once they exist, and the whole current corpus has none.
const duplicateRoot = findDuplicateCalibrationRoot(runs);
if (duplicateRoot !== null) {
  console.error(`oracle-commission-batch: ${duplicateRoot} was given more than once in --runs.`);
  console.error('  The same root twice is one run, and it agrees with itself. Refusing.');
  process.exit(2);
}

// ★ THE HOST CLAIM IS DERIVED, NEVER DECLARED. This used to be a `--hosts` flag the caller asserted, and
// nothing could contradict it: passing `independent-hosts` for two runs from one machine would have made
// every otherwise-clean cell eligible with no objection raised. A flag that can disagree with the data is a
// second source that goes stale, so it is gone rather than kept as a cross-check.
//
// ★ THE TWO FIELDS HAVE OPPOSITE INVARIANTS AND ARE CHECKED AS A PAIR. `environmentId` must MATCH across
// roots (it asserts the runs are comparable — it is built from the runner image and tool versions, so it is
// IDENTICAL across legs by design) and `hostInstanceId` must DIFFER (it asserts they are independent).
// Reading the environment descriptor as the host identity inverts the rule and rejects every correct
// two-leg run, which would look exactly like a safety check working.
//
// ★ THE READ AND THE DERIVATION BOTH LIVE IN `oracle-calibrate.ts`, WHICH IS NOT TIDINESS. That tool
// measures agreement across the same roots and this one files on the strength of it; two copies of "what
// do these two directories mean" could drift into a state where the comparer reports independent hosts and
// the filer refuses, or worse, the reverse.
const hosts = runs.map((root) => readCaptureRootIdentity(root, subject));
const relationship = deriveCalibrationIdentityVerdict(hosts);

const mixedHostRoot = hosts.findIndex((host) => host.mixedHosts);
if (mixedHostRoot >= 0) {
  console.error(`oracle-commission-batch: ${runs[mixedHostRoot]} contains more than one hostInstanceId.`);
  console.error('  That root is not one host, so no single identity describes it. Refusing.');
  process.exit(1);
}
// ★ MIXED WITHIN A ROOT USED TO READ AS ABSENT, WHICH IS THE WRONG END OF THE SAFE/UNSAFE ASYMMETRY. The
// previous code collapsed "this root declares two environments" to `environmentId: null` and then filtered
// nulls out of the cross-root comparison — so an incoherent root passed the mismatch check by having no
// opinion. The host side already refused this shape; the environment side now does too.
const mixedEnvironmentRoot = hosts.findIndex((host) => host.mixedEnvironments);
if (mixedEnvironmentRoot >= 0) {
  console.error(`oracle-commission-batch: ${runs[mixedEnvironmentRoot]} declares more than one environmentId.`);
  console.error('  That root is not one declared environment, so no single identity describes it. Refusing.');
  process.exit(1);
}
if (relationship.environment === 'environment-mismatch') {
  console.error('oracle-commission-batch: the roots report different environmentId values:');
  for (const host of hosts) console.error(`    ${host.environmentId ?? '(none)'}`);
  console.error('  These runs are not the same declared environment, so comparing them measures nothing.');
  process.exit(1);
}

// ★ ABSENCE IS LOUD AND IS ITS OWN STATE. Falling back to `one-host` here would be safe in the sense that
// nothing wrong gets commissioned, and wrong in the sense that matters: "the captures do not say which
// machine made them" and "the captures say one machine" would print the same line, with opposite remedies.
// The two refusals above have already removed the mixed cases, so the remaining three are the scope.
const scope: OracleDeterminismScope =
  relationship.hosts === 'mixed-hosts-within-root' ? 'host-identity-missing' : relationship.hosts;

// ★ NAME THE CONDITION, DO NOT LET THE GENERIC "nothing is eligible" STAND IN FOR IT. Both of these end
// with an empty batch, so the batch-empty refusal below would fire and be technically true — and it would
// send the reader to look for eligible cells when the actual remedy is to capture on a second machine, or
// to wire the producer. Safe is not the same as informative.
if (subcommand === 'write' && scope === 'one-host') {
  console.error('oracle-commission-batch: both roots report the same hostInstanceId, so this measured ONE');
  console.error('  host reproducing itself. That is stage one, and it never completes the condition.');
  console.error('  Capture on a second, independent host and file from those roots.');
  process.exit(1);
}
if (subcommand === 'write' && scope === 'host-identity-missing') {
  console.error('oracle-commission-batch: the captures carry no provenance.hostInstanceId, so independence');
  console.error('  could not be evaluated. Refusing to file: this is UNEVALUATED, not measured-as-one-host.');
  console.error('  Re-capture with a tool-capture that records host identity, then file.');
  process.exit(1);
}

const coverage = readCoverage(subject);
const captures = readCaptureFacts(runs[0]!, subject);
const report = selectCommissionableCells({
  captures,
  coverage,
  determinism: readDeterminism(runs),
  determinismScope: scope,
  held: readHeld(),
  outstanding: readOutstanding(),
  parityWithheld: readParityWithholdings(runs[0]!, subject),
  pinned: readPinned(),
});

const eligible = report.eligible.filter((identity) => only.size === 0 || only.has(identity.split('/')[1] ?? ''));
const batch = eligible.slice(0, Math.max(0, limit));

// ★ THE COMMIT AND THE STALE-CELL LIST ARE FIELDS, NOT PROSE. A census is quoted long after the note that
// carried it, and "which tree was this measured against" has to be answerable by the consumer rather than
// by asking the author. `sourceCommit` says what the ANALYSIS ran on; `stale` says which cells' CAPTURES
// describe a different tree — and those two differing is the defect this exists to surface, because it is
// exactly what produced a census reporting cells as lacking oracles they had since gained.
const staleness = findStaleCaptures(captures, currentSceneSourceHash);
const staleCells = staleness.stale;
console.log(`subject ${subject} | ${coverage.size} live cell(s) | ${runs.length} run(s) on ${scope} (derived)`);
for (const [index, host] of hosts.entries()) {
  console.log(
    `  run ${index + 1} host ${host.hostInstanceId ?? 'UNRECORDED'} env ${host.environmentId ?? 'UNRECORDED'}`,
  );
}
console.log(`sourceCommit ${headCommit()}`);
console.log(
  staleness.compared === 0
    ? `stale UNKNOWN — 0 of ${captures.length} captures carried a comparable provenance.sourceHash; freshness is UNVERIFIED, not clean`
    : staleCells.length === 0
      ? `stale 0 of ${staleness.compared} compared (capture provenance.sourceHash vs scene file) — all current`
      : `stale ${staleCells.length} of ${staleness.compared} compared (capture provenance.sourceHash vs scene file) — CAPTURES DESCRIBE A DIFFERENT TREE; re-capture first`,
);
// ★ PARITY CAME FROM A SEPARATE RUN, SAID IN THE OUTPUT RATHER THAN IN A NOTE. `validate` writes the parity
// report but no status.json, so a census is assembled from the capture runs PLUS a third validate run. A
// three-run census presenting as one is the provenance shape this arc has been burned by repeatedly.
console.log('parity: from a separate validate run (validate writes no status.json), not from these capture roots');
for (const identity of staleCells) console.log(`  STALE ${identity}`);
console.log('');
console.log(`eligible ${eligible.length}${eligible.length > batch.length ? ` (this batch: ${batch.length})` : ''}`);
for (const identity of batch) console.log(`  COMMISSION ${identity}`);
console.log('');
console.log(`blocked ${report.blocked.length}`);
for (const { count, reason } of summarizeOracleBlocks(report.blocked)) {
  console.log(`  ${String(count).padStart(4)}  ${reason}`);
}
// ★ REPORTED BECAUSE IT IS MEASURED, NOT BECAUSE IT DECIDES ANYTHING. Byte-identity across backends was
// a blocking condition until the corpus refuted its premise (see `findBackendCollisions`). It is printed
// so a collision on a scene that could not plausibly be pixel-exact — a blur, a gradient, an antialiased
// curve — is still visible to someone who can look at the scene.
console.log('');
console.log(`byte-identical to a sibling backend ${report.collisions.length} (reported, not blocking)`);

if (readOption('--verbose') !== undefined || rest.includes('--verbose')) {
  for (const cell of report.blocked) console.log(`  ${cell.reason.padEnd(23)} ${cell.identity}  ${cell.detail}`);
  for (const pair of report.collisions) console.log(`  collision              ${pair.identity}  == ${pair.twin}`);
}

if (subcommand === 'report') process.exit(0);

// ★ REPORT MAY SHOW A STALE CENSUS; WRITE MAY NOT ACT ON ONE. Same read/write asymmetry as everything else
// here — looking at a suspect number is how you find out it is suspect, and committing a cell on one is
// how a wrong reference becomes permanent.
if (staleness.compared === 0) {
  console.error('oracle-commission-batch: no capture carried a comparable sourceHash, so freshness is');
  console.error('  UNVERIFIED. Refusing to file: an unverifiable census is not a fresh one.');
  process.exit(1);
}
if (staleCells.length > 0) {
  console.error(`oracle-commission-batch: ${staleCells.length} capture(s) describe a different tree than`);
  console.error('  the current source. Re-capture (npm run build:functional first) before filing.');
  process.exit(1);
}

if (batch.length === 0) {
  // Filing a request that names nothing would open a commission the capture workflow answers with an
  // empty bundle, which `oracle-commission.ts` already refuses. Refusing one step earlier keeps an empty
  // batch from looking like a successful round in the report the user reads.
  console.error('oracle-commission-batch: nothing is eligible, so there is nothing to commission');
  process.exit(1);
}

const id = readOption('--id');
if (id === undefined) {
  console.error('oracle-commission-batch: --id is required; it dates the request and bounds its pending window');
  process.exit(2);
}
const reason = readOption('--reason');
if (reason === undefined) {
  console.error('oracle-commission-batch: --reason is required; a request states why the cells should move');
  process.exit(2);
}

const selectedRoot = hosts[0];
const selectedCapture: OracleRequestCaptureIdentity | null =
  selectedRoot === undefined || selectedRoot.hostInstanceId === null || selectedRoot.environmentId === null
    ? null
    : { environmentId: selectedRoot.environmentId, hostInstanceId: selectedRoot.hostInstanceId };
if (selectedCapture === null) {
  console.error('oracle-commission-batch: the selected capture root has no complete host/environment identity');
  console.error('  Refusing to file a request that cannot name which capture run supplied its pixels.');
  process.exit(1);
}
const targets: OracleRequestTarget[] = [];
for (const identity of batch) {
  const target = readBoundOracleRequestTarget(runs[0]!, identity, selectedCapture);
  if ('problem' in target) {
    console.error(`oracle-commission-batch: ${identity}: ${target.problem}`);
    console.error('  Refusing to file a request without the exact decoded-pixel identity.');
    process.exit(1);
  }
  targets.push(target);
}

const queue = join(repoRoot, 'oracle-requests');
mkdirSync(queue, { recursive: true });
const requestPath = join(queue, `${id}.json`);
if (existsSync(requestPath)) {
  console.error(`oracle-commission-batch: ${requestPath} already exists; pick an id that is not already open`);
  process.exit(1);
}
writeFileSync(requestPath, `${JSON.stringify({ schemaVersion: 2, id, subject, targets, frames, reason }, null, 2)}\n`);

// ★ THE COVERAGE IDENTITY AND THE REQUEST ARE WRITTEN TOGETHER, IN ONE CHANGE (§5). The request says
// which cells are moving; the coverage manifest says which cells OWE a referent at all. Filing only the
// request would leave the cell unrequired, so nothing would ever fail when the bytes never arrived —
// the commission would expire quietly and CI would never have asked for it.
const manifestPath = join(__dirname, 'capture-baseline-coverage-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  subjects: Record<string, Record<string, string[]>>;
};
const updated = addReferenceImageCoverage(manifest.subjects[subject] ?? {}, batch);
if ('missing' in updated) {
  console.error(
    `oracle-commission-batch: ${updated.missing} vanished from the coverage manifest between read and write`,
  );
  process.exit(1);
}
manifest.subjects[subject] = updated.coverage;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log('');
console.log(`wrote ${requestPath}`);
console.log(`added referenceImage to ${batch.length} coverage identit(ies)`);

/** `subject/entry/renderer` → the evidence kinds the coverage manifest requires of it. */
function readCoverage(name: string): Map<string, readonly string[]> {
  const manifest = JSON.parse(readFileSync(join(__dirname, 'capture-baseline-coverage-manifest.json'), 'utf8')) as {
    subjects: Record<string, Record<string, string[]>>;
  };
  const out = new Map<string, readonly string[]>();
  for (const [key, kinds] of Object.entries(manifest.subjects[name] ?? {})) out.set(`${name}/${key}`, kinds);
  return out;
}

/** The capture facts of one run root, for the cells of one subject. */
function readCaptureFacts(root: string, name: string): OracleCaptureFact[] {
  const facts: OracleCaptureFact[] = [];
  const subjectRoot = join(root, name);
  if (!existsSync(subjectRoot)) return facts;
  for (const entry of directories(subjectRoot)) {
    for (const renderer of directories(join(subjectRoot, entry))) {
      const path = join(subjectRoot, entry, renderer, 'status.json');
      if (!existsSync(path)) continue;
      try {
        const status = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
        facts.push({
          baselineHash: typeof status['baselineHash'] === 'string' ? status['baselineHash'] : null,
          hash: typeof status['hash'] === 'string' ? status['hash'] : null,
          identity: `${name}/${entry}/${renderer}`,
          oracle: typeof status['oracle'] === 'string' ? status['oracle'] : null,
          sourceHash: readSourceHash(status),
          state: typeof status['state'] === 'string' ? status['state'] : 'unreadable',
        });
      } catch {
        facts.push({
          baselineHash: null,
          hash: null,
          identity: `${name}/${entry}/${renderer}`,
          oracle: null,
          sourceHash: null,
          state: 'unreadable',
        });
      }
    }
  }
  return facts;
}

/**
 * The determinism verdict per identity, from the same comparison `oracle-calibrate` publishes.
 *
 * Reusing that function rather than re-deriving hash equality here is deliberate: two implementations of
 * "did these runs agree" drift, and the one that drifts is whichever a later change forgets. It also
 * inherits the rule that matters most — a cell one run did not capture is `incomplete`, never folded into
 * agreement.
 */
function readDeterminism(roots: readonly string[]): Map<string, OracleDeterminismVerdict> {
  const calibration = compareCalibrationRuns(roots);
  const out = new Map<string, OracleDeterminismVerdict>();
  for (const identity of calibration.agreed) out.set(identity, 'agreed');
  for (const identity of calibration.disagreed) out.set(identity, 'disagreed');
  for (const identity of calibration.incomplete) out.set(identity, 'incomplete');
  return out;
}

/** Cells held by a peer or a ruling, from the committed hold list. */
function readHeld(): Map<string, string> {
  const path = join(__dirname, 'oracle-held.json');
  if (!existsSync(path)) return new Map();
  const held = (JSON.parse(readFileSync(path, 'utf8')) as { held?: Record<string, string> }).held ?? {};
  return new Map(Object.entries(held));
}

/**
 * Cells the locked release already supplies blessed bytes for, read from `scripts/oracle-lock.json`.
 *
 * ★ IT REFUSES ON AN UNREADABLE LOCK RATHER THAN RETURNING AN EMPTY SET, BECAUSE EMPTY FAILS TOWARD
 * "COMMISSION EVERYTHING". A missing or malformed lock is a state where nothing is known about what is
 * already blessed — and the safe reading of "I don't know" is not "nothing is". Defaulting to empty
 * would re-commission every already-blessed cell, and re-blessing is a separate decision nobody made.
 *
 * ★ AN ABSENT LOCK FILE IS THE ONE EMPTY THAT IS REAL. Before the first release there is no lock, and
 * that genuinely means no cell is pinned. That is why it is distinguished from a lock that exists and
 * cannot be read, which is a defect.
 */
function readPinned(): ReadonlySet<string> {
  const path = join(repoRoot, 'scripts', 'oracle-lock.json');
  const parsed = readOracleLockPins(path);
  if ('problems' in parsed) {
    for (const problem of parsed.problems) console.error(`  ${problem.kind}: ${problem.detail}`);
    console.error(`oracle-commission-batch: ${path} could not be read, so what is already blessed is`);
    console.error('  UNKNOWN. Refusing: treating that as "nothing is pinned" would re-commission every');
    console.error('  blessed cell, and a re-bless is a separate decision.');
    process.exit(1);
  }
  return parsed.pinned;
}

/** Cells already claimed by an open request. */
function readOutstanding(): Set<string> {
  const queueRoot = join(repoRoot, 'oracle-requests');
  if (!existsSync(queueRoot)) return new Set();
  const out = new Set<string>();
  for (const file of readdirSync(queueRoot).filter((name) => name.endsWith('.json'))) {
    const parsed = readOracleRequest(join(queueRoot, file));
    if ('problems' in parsed) {
      for (const problem of parsed.problems) console.error(`  ${problem.kind}: ${problem.detail}`);
      console.error(`oracle-commission-batch: ${file} is not a valid request`);
      process.exit(1);
    }
    for (const cell of getOracleRequestCells(parsed.request)) out.add(cell);
  }
  return out;
}

/** The cells the parity leg's verdicts withhold, from the validation report the gated run wrote. */
function readParityWithholdings(root: string, name: string): Map<string, OracleParityWithholding> {
  const path = join(root, name, 'validation-report.json');
  if (!existsSync(path)) {
    console.error(`oracle-commission-batch: no parity report at ${path}; run \`npm run test:functional:parity\``);
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    result?: { checks?: OracleParityCheck[] };
  };
  const found = findParityWithholdings(parsed.result?.checks ?? [], coverage.keys());
  if ('refused' in found) {
    console.error(`oracle-commission-batch: ${path}: ${found.refused}`);
    console.error('  Re-run `npm run test:functional:parity` without --report.');
    process.exit(1);
  }
  return found.withheld;
}

function directories(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** The commit the ANALYSIS ran against — not the commit the captures describe. See the stale check. */
function headCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * `provenance.sourceHash` from a CAPTURE status record, when it recorded one.
 *
 * ★ NAME WHICH FIELD, ALWAYS. There are several identically-named `sourceHash` fields in this repository —
 * a capture status's `provenance.sourceHash` (this one), a baseline column's vestigial top-level
 * `sourceHash`, and that column's `sha256Provenance.sourceHash`. They attest different things and can
 * disagree, and reading the wrong one has already produced three separate wrong results in a day —
 * including a near-miss where the vestigial field made four correct baselines look stale, in the direction
 * the reader was already expecting. The report says which field it compared for that reason.
 */
function readSourceHash(status: Record<string, unknown>): string | null {
  const provenance = status['provenance'];
  if (typeof provenance !== 'object' || provenance === null) return null;
  const hash = (provenance as Record<string, unknown>)['sourceHash'];
  return typeof hash === 'string' ? hash : null;
}

/**
 * The scene source's current sha256 for a cell, matching what the capture recorded.
 *
 * Resolution mirrors the capture tool's own: a renderer-specific `<entry>.<renderer>.ts` when present,
 * otherwise the backend-agnostic `<entry>.ts` that serves every backend. Missing means the scene is gone,
 * which is residue rather than staleness and is handled by the coverage intersection, not here.
 */
function currentSceneSourceHash(identity: string): string | null {
  const [, entry, renderer] = identity.split('/');
  if (entry === undefined || renderer === undefined) return null;
  for (const candidate of [`${entry}.${renderer}.ts`, `${entry}.ts`]) {
    const path = join(repoRoot, 'functional', 'scenes', candidate);
    if (existsSync(path)) return createHash('sha256').update(readFileSync(path)).digest('hex');
  }
  return null;
}

function readOption(name: string): string | undefined {
  const at = rest.indexOf(name);
  return at === -1 ? undefined : rest[at + 1];
}

export {};
