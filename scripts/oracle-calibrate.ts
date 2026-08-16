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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CalibrationCell {
  identity: string;
  /** One recorded pixel hash per run, in run order. `null` where that run captured nothing. */
  hashes: readonly (string | null)[];
}

export interface CalibrationReport {
  runs: number;
  cells: readonly CalibrationCell[];
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

  return { agreed, cells, disagreed, incomplete, runs: roots.length, seen: identities.size };
}

/**
 * One run's cells: every identity it has a `status.json` for, and the subset that yielded a usable hash.
 *
 * The two are tracked separately on purpose. `seen` answers "was this cell part of this run", which is a
 * question about the filesystem; `hashes` answers "did it produce a comparable measurement", which is a
 * question about the file's contents. Deriving the first from the second is what made failed cells
 * disappear instead of being labelled.
 */
function readRun(root: string): { seen: Set<string>; hashes: Map<string, string> } {
  const seen = new Set<string>();
  const hashes = new Map<string, string>();
  if (!existsSync(root)) return { hashes, seen };
  for (const subject of directories(root)) {
    for (const entry of directories(join(root, subject))) {
      for (const renderer of directories(join(root, subject, entry))) {
        const path = join(root, subject, entry, renderer, 'status.json');
        if (!existsSync(path)) continue;
        const identity = `${subject}/${entry}/${renderer}`;
        seen.add(identity);
        try {
          const status = JSON.parse(readFileSync(path, 'utf8')) as { hash?: unknown; state?: unknown };
          if (status.state === 'ready' && typeof status.hash === 'string') hashes.set(identity, status.hash);
        } catch {
          // Seen, with no usable hash — which is `incomplete`, not absent. The cell is already in `seen`.
        }
      }
    }
  }
  return { hashes, seen };
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
    // ★ THIS TOOL CANNOT SEE WHETHER THE RUNS CAME FROM INDEPENDENT HOSTS, SO IT MUST NOT SAY THEY DID.
    // It is handed directories. Two captures on ONE machine and two on separate machines produce
    // identical input here and answer completely different questions — within-host determinism is
    // necessary for a canonical environment and nowhere near sufficient for one. The first real run of
    // this tool was within-host and it announced "a single canonical environment is viable", which is a
    // conclusion the data could not support. State what was measured; let the caller supply what the
    // runs were.
    lines.push(
      'VERDICT: every compared cell was byte-identical across the runs given, so the noise floor ACROSS' +
        ' THESE RUNS is zero.',
      '  If the runs were on INDEPENDENT HOSTS, this is the evidence a single canonical environment needs.',
      '  If they were repeats on ONE host, it establishes only within-host determinism — necessary for a' +
        ' canonical environment, and not sufficient. This tool is given directories and cannot tell which.',
    );
  } else {
    lines.push(
      'VERDICT: at least one cell differed across runs. A magnitude measurement is now required before a' +
        ' threshold can be chosen; hash equality cannot say HOW far apart they are.',
    );
  }
  return lines.join('\n');
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=scripts\/)/, ''))) {
  const roots = process.argv.slice(2);
  if (roots.length < 2) {
    console.error('usage: oracle-calibrate <run-root> <run-root> [more…]');
    console.error('  each root is a capture output directory (<subject>/<entry>/<renderer>/status.json)');
    process.exit(2);
  }
  const report = compareCalibrationRuns(roots);
  console.log(formatCalibrationReport(report));
  // Disagreement is a RESULT, not a failure: it is the finding that forces per-environment sets or a
  // tolerance. Exit non-zero only when nothing was comparable, which means the run was unconfigured.
  if (report.agreed.length === 0 && report.disagreed.length === 0) {
    console.error('oracle-calibrate: no cell was captured by every run — nothing was compared');
    process.exit(1);
  }
}
