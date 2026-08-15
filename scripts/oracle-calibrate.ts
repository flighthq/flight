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
}

/**
 * Compares the recorded pixel hashes of the same cells across several capture roots.
 *
 * A cell missing from any run is `incomplete`, never folded into agreement: a run that did not capture
 * says nothing about whether it would have matched, and counting it either way would manufacture a
 * result. This is the same rule the capture tiers state as "a missing premise is labelled, never argued".
 */
export function compareCalibrationRuns(roots: readonly string[]): CalibrationReport {
  const identities = new Set<string>();
  const perRun = roots.map((root) => readRunHashes(root));
  for (const run of perRun) for (const identity of run.keys()) identities.add(identity);

  const cells: CalibrationCell[] = [];
  const agreed: string[] = [];
  const disagreed: string[] = [];
  const incomplete: string[] = [];

  for (const identity of [...identities].sort()) {
    const hashes = perRun.map((run) => run.get(identity) ?? null);
    cells.push({ hashes, identity });
    if (hashes.some((hash) => hash === null)) {
      incomplete.push(identity);
      continue;
    }
    if (new Set(hashes).size === 1) agreed.push(identity);
    else disagreed.push(identity);
  }

  return { agreed, cells, disagreed, incomplete, runs: roots.length };
}

/** `<root>/<subject>/<entry>/<renderer>/status.json` → identity → recorded pixel hash. */
function readRunHashes(root: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(root)) return out;
  for (const subject of directories(root)) {
    for (const entry of directories(join(root, subject))) {
      for (const renderer of directories(join(root, subject, entry))) {
        const path = join(root, subject, entry, renderer, 'status.json');
        if (!existsSync(path)) continue;
        try {
          const status = JSON.parse(readFileSync(path, 'utf8')) as { hash?: unknown; state?: unknown };
          if (status.state === 'ready' && typeof status.hash === 'string') {
            out.set(`${subject}/${entry}/${renderer}`, status.hash);
          }
        } catch {
          // An unreadable status is an absent measurement, not a disagreement.
        }
      }
    }
  }
  return out;
}

function directories(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function formatCalibrationReport(report: Readonly<CalibrationReport>): string {
  const lines = [
    `runs compared:     ${report.runs}`,
    `cells agreed:      ${report.agreed.length}`,
    `cells disagreed:   ${report.disagreed.length}`,
    `cells incomplete:  ${report.incomplete.length}`,
    '',
  ];
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
    lines.push(
      'VERDICT: every compared cell was byte-identical across runs. A single canonical environment is' +
        ' viable on this evidence, and the pixel noise floor is zero — any positive tolerance clears it.',
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
