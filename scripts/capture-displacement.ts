// Capture displacement: how much the regression gate WOULD SCORE if a target's content moved, measured
// against the same committed fingerprints the gate compares. It answers the question the gate is actually
// asked — would this catch a defect? — from data already in the tree, with no capture and no browser.
//
// ★ A DIAGNOSTIC, NOT A GATE. Same standing as `npm run untested` / `npm run unchecked` / `npm run
// contrast`: a list to read when deciding where an oracle is worth writing. It never exits non-zero on
// its findings, and nothing should be wired to it.
//
// ★ THIS IS THE PRIMARY SENSITIVITY MEASURE, AND `contrast` IS THE SECONDARY ONE. They answer different
// questions and only one of them is about the gate:
//
//     contrast     — a property of the IMAGE: how far is this frame from a flat field?
//     displacement — a property of the GATE'S RESPONSE: how far would this frame move if it broke?
//
// Only the second is a statement about whether the gate works. Reading a contrast number as sensitivity
// is a real mistake with a measured example: `effect-brightness-contrast` reads 20.21, four times the
// tolerance, and scores 3.38 — under the threshold — when its whole picture shifts one grid cell. A frame
// can be vivid and still be one the gate cannot see change.
//
// ★ THE TECHNIQUE IS GENERAL, AND WORTH NAMING SO IT IS REACHED FOR RATHER THAN REINVENTED. Take the
// stored expectation, MUTATE IT SYNTHETICALLY, and score the mutant with the gate's own comparator. That
// is exactly what `npm run unchecked` does to source (mutate one token, see what no assertion catches),
// applied to a baseline instead of to code. Anywhere a check compares a fresh result against a stored
// expectation, this measure is available and costs nothing to run: no capture, no environment, no
// browser. The alternative — injecting a real defect and re-capturing — is far more expensive and was
// only ever done twice.
//
// ★ WHAT IT CANNOT ANSWER, measured rather than assumed:
//   - it models DISPLACEMENT ONLY. A change in colour or a change that removes content scores
//     differently, and often far higher: bypassing the sketch pass on a target whose contrast reads 3.86
//     scored 225.86, because the fills got their colour back. A low displacement score bounds what a
//     MOVEMENT defect can score; it says nothing about a tonal one.
//   - the mutation TRANSLATES the fingerprint grid, which is not what real content movement does — real
//     movement resamples, and a partial-cell shift lands between these numbers. Read a row as a
//     predictor, not as a measurement of an actual defect.
//   - it inherits the fingerprint's own resolution. A subject smaller than a grid cell moves within one
//     cell and this cannot see it; `text-border-box` is that case by construction, not by neglect.
//
// Retrodictive check, on the one case with a recorded real defect: `text-native/dom` scores 4.62 here,
// and the real injected defect recorded against it measured 5.09 — clearing the tolerance by 0.09. This
// predicted that near-miss. One corroboration is not validation, and it is the only one available.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseBitmapFingerprint } from '../packages/bitmap/src/bitmapFingerprint.js';

// The gate's own pass mark, from captureValidation's regression tolerance. A displacement score is only
// meaningful against it: the number that matters is whether it clears the bar, not its magnitude.
const REGRESSION_TOLERANCE = 5;

interface DisplacementRow {
  oneCell: number;
  target: string;
  twoCells: number;
}

/**
 * The gate's score for a fingerprint against a copy of itself translated by `dx`, `dy` grid cells.
 *
 * Edge cells are clamped rather than wrapped, so the mutation models content sliding within the frame
 * rather than the frame's contents rotating through themselves.
 */
export function computeFingerprintDisplacement(fingerprint: string, dx: number, dy: number): number | null {
  const parsed = parseBitmapFingerprint(fingerprint);
  if (parsed === null || parsed.cells.length === 0) return null;
  const { cells, gridSize } = parsed;
  let sum = 0;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const sourceX = Math.min(gridSize - 1, Math.max(0, x - dx));
      const sourceY = Math.min(gridSize - 1, Math.max(0, y - dy));
      const to = (y * gridSize + x) * 3;
      const from = (sourceY * gridSize + sourceX) * 3;
      sum += Math.abs(cells[to] - cells[from]);
      sum += Math.abs(cells[to + 1] - cells[from + 1]);
      sum += Math.abs(cells[to + 2] - cells[from + 2]);
    }
  }
  return sum / cells.length;
}

/**
 * The WEAKER of the horizontal and vertical displacement scores for one step size — the smaller number.
 *
 * The weaker one, not the mean and not the larger: a gate that catches a sideways move and misses a
 * vertical one of the same size is a gate with a blind axis, and both averaging and taking the larger
 * would report it as sighted. The question is what could pass, so the answer is the axis that passes.
 */
export function computeWorstAxisDisplacement(fingerprint: string, cells: number): number | null {
  const horizontal = computeFingerprintDisplacement(fingerprint, cells, 0);
  const vertical = computeFingerprintDisplacement(fingerprint, 0, cells);
  if (horizontal === null || vertical === null) return null;
  return Math.min(horizontal, vertical);
}

/** Formats the report. The count of targets read travels with the verdict, so an empty scan cannot pass as a clean one. */
export function formatDisplacementReport(rows: readonly DisplacementRow[], limit: number): string {
  const blindToOne = rows.filter((row) => row.oneCell < REGRESSION_TOLERANCE);
  const blindToTwo = rows.filter((row) => row.twoCells < REGRESSION_TOLERANCE);
  const lines = [
    `${rows.length} fingerprinted targets scored against the gate's tolerance of ${REGRESSION_TOLERANCE}.`,
    '',
    'This measures THE GATE, not the image: how far would the committed fingerprint move if the whole',
    'frame slid by one or two grid cells? A target under the tolerance would not report that as a change.',
    `  ${blindToOne.length} would not reach ${REGRESSION_TOLERANCE} if the frame moved ONE cell`,
    `  ${blindToTwo.length} would not reach ${REGRESSION_TOLERANCE} if the frame moved TWO cells`,
    '',
    'lowest first; a low row is where a structural regression could pass green:',
  ];
  for (const row of rows.slice(0, limit)) {
    lines.push(`  ${row.oneCell.toFixed(2).padStart(7)}  ${row.twoCells.toFixed(2).padStart(7)}  ${row.target}`);
  }
  if (rows.length > limit) lines.push(`  … ${rows.length - limit} more, least blind last (--limit to widen)`);
  lines.push('');
  lines.push('A high score here is not a clean bill: this models MOVEMENT only, and says nothing about a');
  lines.push('tonal change. `npm run contrast` answers a different question — how far the image sits from');
  lines.push('a flat field — and the two disagree on which targets are exposed. Read both.');
  return lines.join('\n');
}

/** Reads every committed functional fingerprint and scores it, worst axis first. */
export function readDisplacementRows(root: string): DisplacementRow[] {
  const baselines = join(root, 'functional', 'baselines');
  const rows: DisplacementRow[] = [];
  for (const file of readdirSync(baselines)) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -'.json'.length);
    const baseline = JSON.parse(readFileSync(join(baselines, file), 'utf8')) as Record<
      string,
      { fingerprint?: string }
    >;
    for (const [backend, record] of Object.entries(baseline)) {
      if (typeof record?.fingerprint !== 'string') continue;
      const oneCell = computeWorstAxisDisplacement(record.fingerprint, 1);
      const twoCells = computeWorstAxisDisplacement(record.fingerprint, 2);
      if (oneCell === null || twoCells === null) continue;
      rows.push({ oneCell, target: `${name}/${backend}`, twoCells });
    }
  }
  return rows.sort((a, b) => a.oneCell - b.oneCell || a.target.localeCompare(b.target));
}

function readLimit(argv: readonly string[]): number {
  const flag = argv.find((argument) => argument.startsWith('--limit='));
  if (flag === undefined) return 30;
  const value = Number(flag.slice('--limit='.length));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
}

if (process.argv[1] !== undefined) {
  const rows = readDisplacementRows(process.cwd());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ regressionTolerance: REGRESSION_TOLERANCE, rows }, null, 2));
  } else {
    console.log(formatDisplacementReport(rows, readLimit(process.argv)));
  }
}
