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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareCalibrationRuns } from './oracle-calibrate';
import type {
  OracleCaptureFact,
  OracleDeterminismVerdict,
  OracleParityCheck,
  OracleParityWithholding,
} from './oracle-eligibility';
import {
  findParityWithholdings,
  groupOracleTargets,
  selectCommissionableCells,
  summarizeOracleBlocks,
} from './oracle-eligibility';
import { getOracleRequestCells, readOracleRequest } from './oracle-records';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const [subcommand = 'report', ...rest] = process.argv.slice(2);
if (subcommand !== 'report' && subcommand !== 'write') {
  console.error('usage: oracle-commission-batch <report|write> --runs <dir,dir> --hosts <independent-hosts|one-host>');
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

// ★ AND THE CALLER MUST SAY WHERE THE ROOTS CAME FROM, BECAUSE NOTHING HERE CAN FIND OUT. Two runs in one
// sandbox and two runs on separate machines are indistinguishable from a directory listing, and they
// answer different questions: one host reproducing itself is necessary for a pixel-exact lock; two
// independent hosts agreeing is what the lock actually rests on, since the blessing machine and the
// verifying machine are never the same one. Defaulting this would let the weaker claim pass as the
// stronger one silently — which is the exact substitution the standing rule forbids.
const scope = readOption('--hosts');
if (scope !== 'independent-hosts' && scope !== 'one-host') {
  console.error('oracle-commission-batch: --hosts must be `independent-hosts` or `one-host`');
  console.error('  Nothing here can derive it: two runs in one sandbox and two runs on separate machines');
  console.error('  produce identical input. Only independent hosts can complete the determinism condition.');
  process.exit(2);
}

const coverage = readCoverage(subject);
const report = selectCommissionableCells({
  captures: readCaptureFacts(runs[0]!, subject),
  coverage,
  determinism: readDeterminism(runs),
  determinismScope: scope,
  held: readHeld(),
  outstanding: readOutstanding(),
  parityWithheld: readParityWithholdings(runs[0]!, subject),
  pinned: new Set(),
});

const eligible = report.eligible.filter((identity) => only.size === 0 || only.has(identity.split('/')[1] ?? ''));
const batch = eligible.slice(0, Math.max(0, limit));

console.log(`subject ${subject} | ${coverage.size} live cell(s) | ${runs.length} run(s) on ${scope}`);
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

const queue = join(repoRoot, 'oracle-requests');
mkdirSync(queue, { recursive: true });
const requestPath = join(queue, `${id}.json`);
if (existsSync(requestPath)) {
  console.error(`oracle-commission-batch: ${requestPath} already exists; pick an id that is not already open`);
  process.exit(1);
}
writeFileSync(
  requestPath,
  `${JSON.stringify({ schemaVersion: 1, id, subject, targets: groupOracleTargets(batch), frames, reason }, null, 2)}\n`,
);

// ★ THE COVERAGE IDENTITY AND THE REQUEST ARE WRITTEN TOGETHER, IN ONE CHANGE (§5). The request says
// which cells are moving; the coverage manifest says which cells OWE a referent at all. Filing only the
// request would leave the cell unrequired, so nothing would ever fail when the bytes never arrived —
// the commission would expire quietly and CI would never have asked for it.
const manifestPath = join(__dirname, 'capture-baseline-coverage-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  subjects: Record<string, Record<string, string[]>>;
};
for (const identity of batch) {
  const key = identity.split('/').slice(1).join('/');
  const kinds = manifest.subjects[subject]?.[key];
  if (kinds === undefined) {
    console.error(`oracle-commission-batch: ${identity} vanished from the coverage manifest between read and write`);
    process.exit(1);
  }
  if (!kinds.includes('referenceImage')) kinds.push('referenceImage');
  kinds.sort();
}
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
          state: typeof status['state'] === 'string' ? status['state'] : 'unreadable',
        });
      } catch {
        facts.push({
          baselineHash: null,
          hash: null,
          identity: `${name}/${entry}/${renderer}`,
          oracle: null,
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

function readOption(name: string): string | undefined {
  const at = rest.indexOf(name);
  return at === -1 ? undefined : rest[at + 1];
}

export {};
