// Measures whether repeated captures agree, which is the precondition `flight-oracles` requires before a
// first blessing: a canonical environment measured "across at least two independent clean hosts", and
// pixel thresholds "calibrated from repeated captures".
//
// ★ THE FIRST QUESTION IS BINARY AND COSTS NOTHING, SO IT IS ASKED FIRST.
// Every capture already records `hash` — a sha256 over decoded pixels. So "did two hosts render the same
// bytes?" is answerable by comparing recorded hashes, with no decoder, no browser, and no threshold.
// Only if hosts DISAGREE is a magnitude needed, and only then is the expensive in-page comparison worth
// building. Reaching for the magnitude harness first would be measuring the size of a gap before knowing
// whether there is one.
//
// ★ AND THE ANSWER DECIDES §10 OF THE PROPOSAL, WHICH IS WHY IT IS WORTH RUNNING BEFORE ANY SCHEMA.
// If independent hosts agree exactly, one canonical environment is viable and the reference set has one
// column per backend. If they disagree, per-environment sets are forced. That is presented as a choice
// in the document; it is a measurement, and this is the measurement.
//
// Reads only. Prints a report; the caller decides what to do with it.
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface CalibrationCell {
  identity: string;
  /** One recorded pixel hash per run, in run order. `null` where that run captured nothing. */
  hashes: readonly (string | null)[];
}

/**
 * What one capture root says about the machine and the declared environment that produced it, read from
 * `provenance.hostInstanceId` and `provenance.environmentId` in the statuses the comparison already opens.
 *
 * ★ MIXED IS NOT MISSING, AND BOTH ARE TRACKED RATHER THAN COLLAPSED TO `null`. A root whose statuses
 * disagree about their host is not one host; a root whose statuses carry no host is a root that never
 * recorded one. Folding both into "no identity" would give two conditions with opposite remedies — split
 * the roots vs. re-capture with a tool that records identity — a single indistinguishable line.
 */
export interface CalibrationRootIdentity {
  root: string;
  /** The single host instance every status in this root agrees on, or `null` if absent or disagreeing. */
  hostInstanceId: string | null;
  /** The single declared environment every status in this root agrees on, or `null` if absent/disagreeing. */
  environmentId: string | null;
  mixedHosts: boolean;
  mixedEnvironments: boolean;
  /** Statuses read while deriving the two identities above. */
  seen: number;
}

/**
 * Whether the roots were produced by DIFFERENT machines — the claim `flight-oracles` requires and the
 * claim the calibrate workflow asserts by giving each matrix leg a distinct `FLIGHT_CAPTURE_HOST_ID`.
 */
export type CalibrationHostRelationship =
  /** Every root carries a different `hostInstanceId`: the runs are independent. */
  | 'independent-hosts'
  /** Two or more roots carry the same `hostInstanceId`: this measured one machine reproducing itself. */
  | 'one-host'
  /** At least one root records no host at all, so independence is UNEVALUATED — not refuted. */
  | 'host-identity-missing'
  /** At least one root's statuses disagree about their host, so no single identity describes it. */
  | 'mixed-hosts-within-root';

/**
 * Whether the roots were produced in the SAME declared environment — the opposite invariant, and the one
 * that makes the comparison meaningful at all.
 */
export type CalibrationEnvironmentRelationship =
  | 'matching-environment'
  | 'environment-mismatch'
  | 'environment-identity-missing'
  /** At least one root's statuses disagree about their environment, so the root is not one environment. */
  | 'mixed-environments-within-root';

export interface CalibrationIdentityVerdict {
  hosts: CalibrationHostRelationship;
  environment: CalibrationEnvironmentRelationship;
}

export interface CalibrationReport {
  runs: number;
  cells: readonly CalibrationCell[];
  /**
   * One entry per root, in run order.
   *
   * ★ REQUIRED, NOT OPTIONAL, AND THAT IS THE ENFORCEMENT. If a caller could omit it, an assembled report
   * that forgot the identity would print the same "cannot tell which host" disclaimer as captures that
   * genuinely carry no identity — a tool defect and a real measurement collapsed into one line.
   */
  identities: readonly CalibrationRootIdentity[];
  /** Cells every run captured AND every run agreed on. */
  agreed: readonly string[];
  /** Cells every run captured and at least two runs disagreed on. */
  disagreed: readonly string[];
  /** Cells at least one run failed to capture — neither agreement nor disagreement is claimable. */
  incomplete: readonly string[];
  /**
   * Cells any run had a `status.json` for, whatever it said. `agreed + disagreed + incomplete` must equal
   * this, and `formatCalibrationReport` asserts it — see the report's own accounting line for why.
   */
  seen: number;
}

/**
 * Compares the recorded pixel hashes of the same cells across several capture roots.
 *
 * A cell missing from any run is `incomplete`, never folded into agreement: a run that did not capture
 * says nothing about whether it would have matched, and counting it either way would manufacture a
 * result. This is the same rule the capture tiers state as "a missing premise is labelled, never argued".
 *
 * ★ EXISTENCE IS READ FROM THE DIRECTORY, NEVER FROM THE STATUS CONTENT, and the distinction is not
 * pedantic — it was a real defect. The identity set used to be built from the cells that parsed AND said
 * `ready`, so a cell that failed on EVERY run entered no map, no identity set, and no bucket: it did not
 * report as `incomplete`, it VANISHED, while the totals still looked complete. A real cross-host run
 * published 491/0/0 against a 493-cell corpus and was caught only because a reader happened to know the
 * corpus size. A directory holding a `status.json` IS the cell, whatever the file says — including an
 * unparseable one, which is a seen cell with no hash rather than an absent measurement.
 *
 * ★ THE LIMIT THIS STILL HAS, stated rather than implied: a cell with NO `status.json` in ANY run is
 * invisible here. Nothing was written for it, so nothing on disk distinguishes "never attempted" from
 * "does not exist". Answering that needs the coverage manifest, which is a different record and a
 * deliberate one — see `oracle-check.ts`'s requirement join for the same rule applied to the same gap.
 */
export function compareCalibrationRuns(roots: readonly string[]): CalibrationReport {
  const identities = new Set<string>();
  const perRun = roots.map((root) => readRun(root));
  for (const run of perRun) for (const identity of run.seen) identities.add(identity);

  const cells: CalibrationCell[] = [];
  const agreed: string[] = [];
  const disagreed: string[] = [];
  const incomplete: string[] = [];

  for (const identity of [...identities].sort()) {
    const hashes = perRun.map((run) => run.hashes.get(identity) ?? null);
    cells.push({ hashes, identity });
    if (hashes.some((hash) => hash === null)) {
      incomplete.push(identity);
      continue;
    }
    if (new Set(hashes).size === 1) agreed.push(identity);
    else disagreed.push(identity);
  }

  return {
    agreed,
    cells,
    disagreed,
    identities: perRun.map((run) => run.identity),
    incomplete,
    runs: roots.length,
    seen: identities.size,
  };
}

/**
 * What one capture root says about the host and environment that produced it.
 *
 * Reads EVERY status rather than sampling one: a root whose files disagree is not one host, and a sampled
 * read would pick an arbitrary winner and report a clean identity for an incoherent root. `subject` scopes
 * the walk to one subject directory; omitted, every subject in the root is read.
 */
export function readCaptureRootIdentity(root: string, subject?: string): CalibrationRootIdentity {
  return readRun(root, subject).identity;
}

/**
 * The pair of claims the calibrate workflow asserts, derived from what the roots actually recorded.
 *
 * ★ THE TWO FIELDS HAVE OPPOSITE INVARIANTS AND ARE DERIVED AS A PAIR. `hostInstanceId` must DIFFER across
 * roots (it asserts the runs are independent); `environmentId` must MATCH (it asserts they are comparable —
 * it is built from the runner image and tool versions, so it is IDENTICAL across matrix legs by design).
 * Reading the environment descriptor as the host identity inverts the rule and rejects every correct
 * two-leg run, which would look exactly like a safety check working.
 *
 * ★ THIS IS THE ONE PLACE EITHER RELATIONSHIP IS DECIDED. The comparer and the commissioning CLI both call
 * it, so the tool that measures agreement and the tool that files on the strength of it cannot come to
 * different conclusions about the same two directories.
 */
export function deriveCalibrationIdentityVerdict(
  identities: readonly Readonly<CalibrationRootIdentity>[],
): CalibrationIdentityVerdict {
  const hostIds = identities.map((identity) => identity.hostInstanceId);
  const environmentIds = identities.map((identity) => identity.environmentId);
  return {
    environment: identities.some((identity) => identity.mixedEnvironments)
      ? 'mixed-environments-within-root'
      : environmentIds.some((id) => id === null)
        ? 'environment-identity-missing'
        : new Set(environmentIds).size === 1
          ? 'matching-environment'
          : 'environment-mismatch',
    hosts: identities.some((identity) => identity.mixedHosts)
      ? 'mixed-hosts-within-root'
      : hostIds.some((id) => id === null)
        ? 'host-identity-missing'
        : new Set(hostIds).size === hostIds.length
          ? 'independent-hosts'
          : 'one-host',
  };
}

/**
 * One run's cells: every identity it has a `status.json` for, and the subset that yielded a usable hash.
 *
 * The two are tracked separately on purpose. `seen` answers "was this cell part of this run", which is a
 * question about the filesystem; `hashes` answers "did it produce a comparable measurement", which is a
 * question about the file's contents. Deriving the first from the second is what made failed cells
 * disappear instead of being labelled.
 */
function readRun(
  root: string,
  subjectFilter?: string,
): { seen: Set<string>; hashes: Map<string, string>; identity: CalibrationRootIdentity } {
  const seen = new Set<string>();
  const hashes = new Map<string, string>();
  const hostIds = new Set<string>();
  const environmentIds = new Set<string>();
  let statuses = 0;
  const subjects = subjectFilter === undefined ? directories(root) : [subjectFilter];
  for (const subject of subjects) {
    for (const entry of directories(join(root, subject))) {
      for (const renderer of directories(join(root, subject, entry))) {
        const path = join(root, subject, entry, renderer, 'status.json');
        if (!existsSync(path)) continue;
        const identity = `${subject}/${entry}/${renderer}`;
        seen.add(identity);
        statuses += 1;
        try {
          const status = JSON.parse(readFileSync(path, 'utf8')) as {
            hash?: unknown;
            provenance?: unknown;
            state?: unknown;
          };
          if (status.state === 'ready' && typeof status.hash === 'string') hashes.set(identity, status.hash);
          const provenance = (status.provenance ?? {}) as Record<string, unknown>;
          if (typeof provenance['hostInstanceId'] === 'string') hostIds.add(provenance['hostInstanceId']);
          if (typeof provenance['environmentId'] === 'string') environmentIds.add(provenance['environmentId']);
        } catch {
          // Seen, with no usable hash and no identity — which is `incomplete`, not absent. The cell is
          // already in `seen`, and an unreadable status simply contributes no provenance either way.
        }
      }
    }
  }
  return {
    hashes,
    identity: {
      environmentId: environmentIds.size === 1 ? [...environmentIds][0]! : null,
      hostInstanceId: hostIds.size === 1 ? [...hostIds][0]! : null,
      mixedEnvironments: environmentIds.size > 1,
      mixedHosts: hostIds.size > 1,
      root,
      seen: statuses,
    },
    seen,
  };
}

function directories(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function formatCalibrationReport(report: Readonly<CalibrationReport>): string {
  // ★ THE TOOL ASSERTS ITS OWN ACCOUNTING RATHER THAN LEAVING IT TO ARITHMETIC. The defect this replaced
  // published `491 agreed / 0 disagreed / 0 incomplete` for a 493-cell corpus, and it was caught only
  // because a reader happened to know the corpus size — "0 incomplete" reads as "nothing skipped" to
  // anyone who does not. A total that does not reconcile must say so in the report that carries it.
  const bucketed = report.agreed.length + report.disagreed.length + report.incomplete.length;
  const lines = [
    `runs compared:     ${report.runs}`,
    `cells seen:        ${report.seen}`,
    `cells agreed:      ${report.agreed.length}`,
    `cells disagreed:   ${report.disagreed.length}`,
    `cells incomplete:  ${report.incomplete.length}`,
    bucketed === report.seen
      ? `accounting:        ${bucketed} = ${report.seen} seen, every cell in exactly one bucket`
      : `accounting:        BROKEN — ${bucketed} bucketed vs ${report.seen} seen; ${report.seen - bucketed} cell(s) unaccounted for`,
    '',
  ];
  // ★ THE IDENTITIES ARE PRINTED WHATEVER THE VERDICT, INCLUDING WHEN THEY ARE ABSENT. The verdict below
  // states which case applies; these lines are what a reader checks that statement against, and
  // `UNRECORDED` is a finding about the captures rather than a blank.
  const verdict = deriveCalibrationIdentityVerdict(report.identities);
  lines.push('identity, as recorded by the captures themselves:');
  for (const [index, identity] of report.identities.entries()) {
    lines.push(
      `  run ${index + 1}  host ${describeIdentityField(identity.hostInstanceId, identity.mixedHosts)}` +
        `  env ${describeIdentityField(identity.environmentId, identity.mixedEnvironments)}` +
        `  (${identity.seen} status file(s), ${identity.root})`,
    );
  }
  lines.push(`  hosts:       ${verdict.hosts} — ${HOST_RELATIONSHIP_MEANING[verdict.hosts]}`);
  lines.push(`  environment: ${verdict.environment} — ${ENVIRONMENT_RELATIONSHIP_MEANING[verdict.environment]}`);
  lines.push('');
  // ★ THE AGREED CELLS ARE NAMED, NOT COUNTED, AND THE OMISSION ALREADY COST SOMETHING. A cross-host run
  // established that two independent machines rendered byte-identical output, and the only durable record
  // of it was a count — "eight GPU-shaded cells". When the single locked reference image was later
  // questioned, nobody could tell from the tree whether that cell had been among the eight, so a
  // measurement that may well have covered it could not be used to defend it. A population that is not
  // written down cannot be checked later, and the count is the part nobody needs.
  for (const identity of report.agreed) lines.push(`  AGREED     ${identity}`);
  for (const identity of report.disagreed) {
    const cell = report.cells.find((c) => c.identity === identity);
    lines.push(`  DISAGREED  ${identity}`);
    for (const [index, hash] of (cell?.hashes ?? []).entries()) {
      lines.push(`    run ${index + 1}: ${hash === null ? '(not captured)' : hash.slice(0, 16)}`);
    }
  }
  for (const identity of report.incomplete) lines.push(`  INCOMPLETE ${identity}`);
  lines.push('');
  // ★ THREE OUTCOMES, NOT TWO. An empty comparison is not a disagreement, and the two-branch version said
  // it was: with nothing compared it fell through and announced "at least one cell differed", which is a
  // verdict about a measurement that never happened. That is the exact failure this tier exists to
  // prevent, produced by the tool meant to prevent it.
  if (report.agreed.length === 0 && report.disagreed.length === 0) {
    lines.push(
      'VERDICT: NOTHING WAS COMPARED. No cell was captured by every run, so this says nothing about' +
        ' agreement in either direction — it is an unconfigured run, not a clean one.',
    );
  } else if (report.disagreed.length === 0) {
    // ★ THE TOOL NOW READS WHAT THE RUNS WERE INSTEAD OF HANDING THE READER BOTH BRANCHES. It used to say
    // "if independent hosts … if one host … this tool is given directories and cannot tell which", which
    // was honest and useless in the same sentence: the captures had been carrying the answer since the
    // calibrate workflow started stamping `hostInstanceId` per matrix leg, and the workflow's own comment
    // claimed an enforcement that happened nowhere. The disclaimer is kept for the case that actually
    // warrants it — captures with no identity — and only for that case.
    lines.push(
      'VERDICT: every compared cell was byte-identical across the runs given, so the noise floor ACROSS' +
        ' THESE RUNS is zero.',
    );
    if (verdict.hosts === 'independent-hosts' && verdict.environment === 'matching-environment') {
      lines.push(
        '  The roots carry DISTINCT hostInstanceId values under a MATCHING environmentId, so these were' +
          ' independent hosts in one declared environment: this IS the evidence a single canonical' +
          ' environment needs.',
        // ★ STABLE IS NOT CORRECT, AND THE STRONGEST VERDICT THIS TOOL CAN REACH IS STILL ONLY ABOUT
        // STABILITY. Agreement across hosts says the pixels REPRODUCE; nothing here has looked at whether
        // they are the RIGHT pixels. A cell is still commissioned on verified correctness, never on this.
        '  It says the pixels are STABLE across hosts. It says nothing about whether they are CORRECT.',
      );
    } else if (verdict.hosts === 'independent-hosts') {
      lines.push(
        `  The roots carry DISTINCT hostInstanceId values, but their environment relationship is` +
          ` ${verdict.environment}. Agreement across DIFFERENT declared environments does not answer the` +
          ' canonical-environment question, which is about one environment reproducing across hosts.',
      );
    } else if (verdict.hosts === 'one-host') {
      lines.push(
        '  The roots carry the SAME hostInstanceId, so this measured ONE machine reproducing itself.' +
          ' Within-host determinism is necessary for a canonical environment and nowhere near sufficient' +
          ' for one. Capture on a second, independent host before reading this as a cross-host result.',
      );
    } else if (verdict.hosts === 'mixed-hosts-within-root') {
      lines.push(
        '  At least one root contains more than one hostInstanceId, so no single identity describes it and' +
          ' the runs cannot be compared as hosts at all. Split the roots by host and re-compare.',
      );
    } else {
      lines.push(
        '  If the runs were on INDEPENDENT HOSTS, this is the evidence a single canonical environment needs.',
        '  If they were repeats on ONE host, it establishes only within-host determinism — necessary for a' +
          ' canonical environment, and not sufficient. These captures record no provenance.hostInstanceId,' +
          ' so this tool cannot tell which.',
      );
    }
  } else {
    lines.push(
      'VERDICT: at least one cell differed across runs. A magnitude measurement is now required before a' +
        ' threshold can be chosen; hash equality cannot say HOW far apart they are.',
    );
  }
  return lines.join('\n');
}

/**
 * The durable form of a calibration comparison: the cells BY NAME, plus the identities they were measured
 * under. This is what a later reader consumes instead of re-running the workflow.
 *
 * ★ NAMES, NOT COUNTS, AND THE DIFFERENCE IS THE WHOLE POINT OF THE FILE. "493 cells agreed" and "there
 * are 493 live cells" are two numbers that are equal, and equality of counts is not identity of sets. A
 * reader with only the counts can derive per-cell determinism for a cell that was never in the
 * comparison — the corpus can gain and lose cells and still total 493. Nothing may join this record to
 * the coverage manifest except by name.
 *
 * ★ IT CARRIES ONLY WHAT WAS READ FROM THE CAPTURES. The run id, the head sha and the workflow shape are
 * real and useful and live in `agents/render-oracle-calibration-record.md`, because this tool did not
 * measure them and a file that mixes the two voices cannot be audited. The host ids happen to name their
 * own run, which is enough to tie the two records together.
 */
export interface CalibrationRecord {
  $comment: string;
  schemaVersion: 1;
  roots: readonly Readonly<CalibrationRootIdentity>[];
  relationship: CalibrationIdentityVerdict;
  agreed: readonly string[];
  disagreed: readonly string[];
  incomplete: readonly string[];
}

/** The comparison as a durable record. Pure: the caller decides where, or whether, to write it. */
export function buildCalibrationRecord(report: Readonly<CalibrationReport>): CalibrationRecord {
  return {
    $comment: RECORD_COMMENT,
    agreed: report.agreed,
    disagreed: report.disagreed,
    incomplete: report.incomplete,
    relationship: deriveCalibrationIdentityVerdict(report.identities),
    roots: report.identities,
    schemaVersion: 1,
  };
}

/**
 * The first root given twice, or `null` if every root is distinct.
 *
 * ★ A ROOT COMPARED WITH ITSELF AGREES WITH ITSELF, AND THE REPORT LOOKS PERFECT. Every cell is
 * byte-identical to itself by construction, so a duplicated path prints the strongest verdict this tool
 * has over a comparison that never happened. It is a realistic slip rather than a contrived one: the two
 * roots are typed by hand from two artifact directories with names differing in one character, and the
 * paths are long. Compared by resolved path, so `x`, `./x` and `x/` are one root.
 */
export function findDuplicateCalibrationRoot(roots: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const root of roots) {
    const key = existsSync(root) ? realpathSync(root) : resolve(root);
    if (seen.has(key)) return root;
    seen.add(key);
  }
  return null;
}

/**
 * One identity field as the report prints it. `MIXED` and `UNRECORDED` are different findings about the
 * captures and never share a line — see `CalibrationRootIdentity`.
 */
function describeIdentityField(value: string | null, mixed: boolean): string {
  if (mixed) return 'MIXED (this root records more than one)';
  return value ?? 'UNRECORDED';
}

const RECORD_COMMENT =
  'Which cells were measured byte-identical across independent hosts, BY NAME. Generated by ' +
  '`npm run oracle:calibrate -- <rootA> <rootB> --record <path>`; every field here was read from the ' +
  'captures. The run and commit it came from are in agents/render-oracle-calibration-record.md, which ' +
  'this tool did not measure. JOIN ON NAMES, NEVER ON COUNTS: "N cells agreed" and "there are N live ' +
  'cells" can be the same number over different sets, and a count-based join would grant a cell ' +
  'determinism it was never measured for. It is ONE cross-host comparison per cell, not repeated ' +
  'sampling — strong, because real nondeterminism would have to correlate perfectly across two ' +
  'machines, but a single sample, and it says nothing about whether the pixels are CORRECT.';

const HOST_RELATIONSHIP_MEANING: Readonly<Record<CalibrationHostRelationship, string>> = {
  'host-identity-missing':
    'at least one root records no provenance.hostInstanceId, so independence is UNEVALUATED (not refuted)',
  'independent-hosts': 'every root records a different provenance.hostInstanceId',
  'mixed-hosts-within-root': 'a root records more than one provenance.hostInstanceId, so it is not one host',
  'one-host': 'two or more roots record the SAME provenance.hostInstanceId',
};

const ENVIRONMENT_RELATIONSHIP_MEANING: Readonly<Record<CalibrationEnvironmentRelationship, string>> = {
  'environment-identity-missing': 'at least one root records no provenance.environmentId',
  'environment-mismatch': 'the roots declare DIFFERENT environments, so they are not comparable runs',
  'matching-environment': 'every root declares the same provenance.environmentId',
  'mixed-environments-within-root': 'a root records more than one provenance.environmentId',
};

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=scripts\/)/, ''))) {
  const argv = process.argv.slice(2);
  const recordFlag = argv.indexOf('--record');
  const recordPath = recordFlag < 0 ? undefined : argv[recordFlag + 1];
  if (recordFlag >= 0 && recordPath === undefined) {
    console.error('oracle-calibrate: --record needs a path to write the named-cell record to');
    process.exit(2);
  }
  const roots = recordFlag < 0 ? argv : [...argv.slice(0, recordFlag), ...argv.slice(recordFlag + 2)];
  if (roots.length < 2) {
    console.error('usage: oracle-calibrate <run-root> <run-root> [more…] [--record <path>]');
    console.error('  each root is a capture output directory (<subject>/<entry>/<renderer>/status.json)');
    console.error('  --record writes the cells BY NAME, which is what a later reader may join on');
    process.exit(2);
  }
  const duplicate = findDuplicateCalibrationRoot(roots);
  if (duplicate !== null) {
    console.error(`oracle-calibrate: ${duplicate} was given more than once.`);
    console.error('  A root compared with itself agrees with itself, so this would print the strongest');
    console.error('  verdict this tool has over a comparison that never happened. Refusing.');
    process.exit(2);
  }
  const report = compareCalibrationRuns(roots);
  console.log(formatCalibrationReport(report));
  if (recordPath !== undefined) {
    writeFileSync(recordPath, `${JSON.stringify(buildCalibrationRecord(report), null, 2)}\n`);
    console.log(`\nwrote ${report.agreed.length} agreed cell name(s) to ${recordPath}`);
  }
  // Disagreement is a RESULT, not a failure: it is the finding that forces per-environment sets or a
  // tolerance. Exit non-zero only when nothing was comparable, which means the run was unconfigured.
  if (report.agreed.length === 0 && report.disagreed.length === 0) {
    console.error('oracle-calibrate: no cell was captured by every run — nothing was compared');
    process.exit(1);
  }
}
