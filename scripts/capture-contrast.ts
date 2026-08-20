// Capture contrast: how much internal contrast each functional target's committed fingerprint carries,
// in the same units the regression gate thresholds. It answers one question — how much has this gate got
// to grip? — from data already in the tree.
//
// ★ A DIAGNOSTIC, NOT A GATE. Same standing as `npm run untested` / `npm run unchecked`: a list to read
// when deciding where an oracle is worth writing. It never exits non-zero on its findings, and nothing
// should be wired to it. Earning gate status would be a separate decision needing its own evidence.
//
// ★ THIS IS THE SECONDARY SENSITIVITY MEASURE. `npm run displacement` is the primary one, and the two
// answer different questions:
//
//     contrast     — a property of the IMAGE: how far is this frame from a flat field?
//     displacement — a property of the GATE'S RESPONSE: how far would this frame move if it broke?
//
// Only the second is a statement about whether the gate works, and reading a contrast number as gate
// sensitivity is a mistake with a measured example: `effect-brightness-contrast` reads 20.21 here, four
// times the tolerance, and scores 3.38 — under it — when its whole picture shifts one grid cell. Contrast
// still earns its place, because it catches what displacement cannot: a frame with nothing in it to move
// is invisible to a displacement measure and obvious to this one.
//
// THE MEASURE. The gate scores a change as the mean absolute per-channel difference over the 16x16x3
// fingerprint grid. Contrast applies that same comparison between a target's committed fingerprint and a
// uniform frame of its own corner cell — so a target reading 0.55 has a whole picture worth a ninth of
// the gate's threshold of 5.
//
// ★ WHAT IT CANNOT ANSWER, measured rather than assumed. Low contrast bounds what a STRUCTURAL change can
// score — content moving, disappearing, or losing its color on a sparse frame. It does NOT bound a change
// in the frame's overall TONE, which is a global shift rather than a change confined to the drawn content:
// bypassing the sketch pass on a target reading 3.86 scored 225.86, because the fills got their color
// back. Read a low number as "structural defects hide here", never as "this gate cannot fail".
//
// Retrodictive validation, on two cases recorded before this measure existed: text-native/dom reads 6.04
// and a real injected defect there measured 5.09, clearing the threshold by 0.09; text-strikethrough/dom
// reads 2.05, and its gate reported 0.00 green while its own oracle was throwing on a real defect.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseBitmapFingerprint } from '../packages/bitmap/src/bitmapFingerprint.js';
import { readCaptureBaselineCoverageManifest } from '../packages/tool-capture/src/captureBaselineCoverageManifest.js';

// The gate's own pass mark, from captureValidation's regression tolerance. Contrast is only meaningful
// against it: the number that matters is the ratio, not the magnitude.
const REGRESSION_TOLERANCE = 5;

interface ContrastRow {
  contrast: number;
  hasOracle: boolean;
  target: string;
}

const root = process.cwd();
const jsonMode = process.argv.includes('--json');
const limit = readLimit(process.argv);

const rows = readContrastRows();
const belowTolerance = rows.filter((row) => row.contrast < REGRESSION_TOLERANCE);
const exposed = belowTolerance.filter((row) => !row.hasOracle);

if (jsonMode) {
  console.log(JSON.stringify({ regressionTolerance: REGRESSION_TOLERANCE, rows }, null, 2));
} else {
  console.log(
    `${rows.length} fingerprinted targets — ${belowTolerance.length} carry less contrast than the gate's ` +
      `tolerance of ${REGRESSION_TOLERANCE}, and ${exposed.length} of those have no oracle either.`,
  );
  console.log(
    'This measures the IMAGE — how far each frame sits from a flat field. It is NOT gate sensitivity: ' +
      'for that, run `npm run displacement`, which scores what the gate would report if content moved.',
  );
  console.log('\nlowest contrast first; a target with no oracle is the one worth writing one for:');
  for (const row of rows.slice(0, limit)) {
    console.log(`  ${row.contrast.toFixed(2).padStart(7)}  ${row.hasOracle ? 'oracle ' : 'NO ORACLE'}  ${row.target}`);
  }
  if (rows.length > limit) console.log(`  … ${rows.length - limit} more, highest contrast last (--limit to widen)`);
}

// The mean absolute per-channel difference between a fingerprint and a uniform frame of its corner cell —
// the same arithmetic compareBitmapFingerprints applies between two captures, so the result is directly
// comparable to a regression distance.
function computeFingerprintContrast(fingerprint: string): number | null {
  const parsed = parseBitmapFingerprint(fingerprint);
  if (parsed === null || parsed.cells.length === 0) return null;
  const cells = parsed.cells;
  let sum = 0;
  for (let index = 0; index < cells.length; index += 1) sum += Math.abs(cells[index] - cells[index % 3]);
  return sum / cells.length;
}

function readContrastRows(): ContrastRow[] {
  const baselines = join(root, 'functional', 'baselines');
  const pinned = readCaptureBaselineCoverageManifest(root)?.subjects.functional ?? {};
  const rows: ContrastRow[] = [];
  for (const file of readdirSync(baselines)) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -'.json'.length);
    const baseline = JSON.parse(readFileSync(join(baselines, file), 'utf8')) as Record<
      string,
      { fingerprint?: string }
    >;
    for (const [backend, record] of Object.entries(baseline)) {
      if (typeof record?.fingerprint !== 'string') continue;
      const contrast = computeFingerprintContrast(record.fingerprint);
      if (contrast === null) continue;
      const target = `${name}/${backend}`;
      rows.push({ contrast, hasOracle: (pinned[target] ?? []).includes('oracle'), target });
    }
  }
  return rows.sort((a, b) => a.contrast - b.contrast || a.target.localeCompare(b.target));
}

function readLimit(argv: readonly string[]): number {
  const flag = argv.find((argument) => argument.startsWith('--limit='));
  if (flag === undefined) return 30;
  const value = Number(flag.slice('--limit='.length));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
}
