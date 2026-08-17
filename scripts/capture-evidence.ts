// The capture evidence census: which evidence each capture target actually carries, compared against the
// committed capture baseline coverage manifest.
//
// ★ WHY THIS IS A SEPARATE PROCESS FROM `validate`. A validate run observes ONE evidence kind — the
// fingerprint — because that is the only kind it measures, and it correctly declares as much so the other
// columns are never reported lost. That leaves the screenshot and oracle columns pinned but unread: the
// manifest knows a target should carry an oracle, and nothing ever checks that it still does. This census
// reads all three from the tree itself, so a pin that stops being true becomes a named diff.
//
// It needs NO BROWSER: fingerprint and screenshot evidence are fields in the committed baseline, and
// oracle evidence is an export in the scene source. That is what makes it cheap enough to gate on rather
// than to run only at acceptance time.
//
// ★ WHAT IT CANNOT ANSWER. This is a STATIC scan, so the oracle column means "the scene exports an
// oracle", never "the verifier called it". Those are different claims and only the verifier can settle
// the second — it records that per target as `oracle` in its own status artifact. Do not read a green
// census as evidence that oracles ran.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { CaptureBaselineEvidenceKind } from '../packages/tool-capture/src/captureBaselineCoverageManifest.js';
import {
  diffCaptureBaselineCoverage,
  isCaptureBaselineCoverageFailure,
  readCaptureBaselineCoverageManifest,
  writeCaptureBaselineCoverageManifest,
} from '../packages/tool-capture/src/captureBaselineCoverageManifest.js';
import { readRepeatedCliOption, selectCaptureEvidenceTargets } from './capture-evidence-selection.js';

const FUNCTIONAL_BACKENDS = ['dom', 'canvas', 'webgl', 'webgpu'];
const ORACLE_EXPORT = /export\s+(?:async\s+)?function\s+assertRender\s*\(|export\s+const\s+assertRender\s*[:=]/;

const root = process.cwd();
const checkMode = process.argv.includes('--check');
const jsonMode = process.argv.includes('--json');
const updateMode = process.argv.includes('--update');
const argv = process.argv.slice(2);
const updateTargets = readRepeatedCliOption(argv, 'target');
const selectors = argv.filter((argument, index) => !argument.startsWith('--') && argv[index - 1] !== '--target');
if (updateMode && selectors.length > 0) throw new Error('Use exact --target subject/entry/renderer selectors');
if (updateMode && updateTargets.length === 0) {
  throw new Error('Capture evidence acceptance requires at least one exact --target subject/entry/renderer');
}
if (!updateMode && updateTargets.length > 0) throw new Error('--target is only valid with evidence:baseline');

function baselineField(subject: string, name: string, column: string, field: string): unknown {
  const path = join(root, subject, 'baselines', `${name}.json`);
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>;
  return parsed[column]?.[field];
}

function collectFunctional(): Record<string, CaptureBaselineEvidenceKind[]> {
  const scenesDir = join(root, 'functional', 'scenes');
  const backendsByName = new Map<string, Set<string>>();
  for (const file of readdirSync(scenesDir)) {
    if (!file.endsWith('.ts')) continue;
    const stem = file.slice(0, -3);
    const dot = stem.lastIndexOf('.');
    const suffix = dot === -1 ? '' : stem.slice(dot + 1);
    const name = FUNCTIONAL_BACKENDS.includes(suffix) ? stem.slice(0, dot) : stem;
    const backends = FUNCTIONAL_BACKENDS.includes(suffix) ? [suffix] : FUNCTIONAL_BACKENDS;
    const set = backendsByName.get(name) ?? new Set<string>();
    for (const backend of backends) set.add(backend);
    backendsByName.set(name, set);
  }
  const out: Record<string, CaptureBaselineEvidenceKind[]> = {};
  for (const [name, backends] of backendsByName) {
    for (const backend of backends) {
      const specific = join(scenesDir, `${name}.${backend}.ts`);
      const scenePath = existsSync(specific) ? specific : join(scenesDir, `${name}.ts`);
      const kinds: CaptureBaselineEvidenceKind[] = [];
      if (baselineField('functional', name, backend, 'fingerprint')) kinds.push('fingerprint');
      if (existsSync(scenePath) && ORACLE_EXPORT.test(readFileSync(scenePath, 'utf8'))) kinds.push('oracle');
      if (baselineField('functional', name, backend, 'sha256')) kinds.push('screenshot');
      if (kinds.length > 0) out[`${name}/${backend}`] = kinds;
    }
  }
  return out;
}

function collectExamples(): Record<string, CaptureBaselineEvidenceKind[]> {
  const packagesDir = join(root, 'examples', 'packages');
  const out: Record<string, CaptureBaselineEvidenceKind[]> = {};
  for (const name of readdirSync(packagesDir)) {
    const sourceDir = join(packagesDir, name, 'src');
    if (!existsSync(sourceDir)) continue;
    for (const backend of FUNCTIONAL_BACKENDS) {
      if (!existsSync(join(sourceDir, `render.${backend}.ts`))) continue;
      const kinds: CaptureBaselineEvidenceKind[] = [];
      if (baselineField('examples', name, backend, 'fingerprint')) kinds.push('fingerprint');
      const app = join(sourceDir, 'app.ts');
      if (existsSync(app) && ORACLE_EXPORT.test(readFileSync(app, 'utf8'))) kinds.push('oracle');
      if (baselineField('examples', name, backend, 'sha256')) kinds.push('screenshot');
      if (kinds.length > 0) out[`${name}/${backend}`] = kinds;
    }
  }
  return out;
}

// ★ THE KINDS A LOCAL RUN CAN SPEAK FOR, DECLARED ONCE AND USED BY BOTH PATHS.
// `referenceImage` is deliberately absent: those bytes live in a `flight-reference-images` release and are joined
// in through `scripts/reference-image-lock.json`, so nothing this script inspects can confirm or deny one
// (see CaptureBaselineEvidenceKind for the full argument).
//
// It has to reach BOTH call sites below or they disagree about what this run settled. It previously
// reached only the `--update` path, and the diff path then reported every pinned `referenceImage` as
// "pinned, no longer carried" — a coverage LOSS, blocking a merge, for a kind no run was ever able to
// carry. One constant, two uses, so the two cannot drift apart again.
const LOCALLY_OBSERVABLE_KINDS: readonly CaptureBaselineEvidenceKind[] = ['fingerprint', 'oracle', 'screenshot'];

const observed: Record<string, Record<string, CaptureBaselineEvidenceKind[]>> = {
  examples: collectExamples(),
  functional: collectFunctional(),
};
const subjects = selectors.length > 0 ? selectors.filter((s) => s in observed) : Object.keys(observed);
const manifest = readCaptureBaselineCoverageManifest(root);

if (updateMode) {
  const selections = selectCaptureEvidenceTargets(updateTargets, observed, manifest.subjects);
  for (const [subject, selection] of Object.entries(selections)) {
    writeCaptureBaselineCoverageManifest(
      root,
      subject,
      selection.covered,
      null,
      selection.determined,
      LOCALLY_OBSERVABLE_KINDS,
    );
    console.log(`${subject}: accepted ${selection.determined.length} exact target(s)`);
  }
  process.exit(0);
}

let failed = false;
const report: Record<string, unknown> = {};
for (const subject of subjects) {
  const targets = observed[subject];
  const diff = diffCaptureBaselineCoverage(manifest, subject, targets, Object.keys(targets), {
    entryFiltered: false,
    activeRenderers: null,
    kinds: LOCALLY_OBSERVABLE_KINDS,
  });
  report[subject] = diff;
  if (!jsonMode) {
    // Derived from the observed kinds rather than a literal per-kind object: a new evidence kind must not
    // be able to increment a key that does not exist and report NaN.
    const counts: Partial<Record<CaptureBaselineEvidenceKind, number>> = {};
    for (const kinds of Object.values(targets)) for (const kind of kinds) counts[kind] = (counts[kind] ?? 0) + 1;
    console.log(
      `${subject}: ${Object.keys(targets).length} targets — ${counts.fingerprint ?? 0} fingerprint, ${counts.screenshot ?? 0} screenshot, ${counts.oracle ?? 0} oracle`,
    );
    for (const lost of diff.lost) console.error(`  - ${lost}  (pinned, no longer carried)`);
    for (const absent of diff.absent) console.error(`  - ${absent}  (pinned, target no longer exists)`);
    for (const gained of diff.gained) console.error(`  + ${gained}  (carried, not yet pinned)`);
  }
  if (isCaptureBaselineCoverageFailure(diff)) failed = true;
}
if (jsonMode) console.log(JSON.stringify(report, null, 2));
if (checkMode && failed) {
  console.error(
    '\nCapture evidence does not match scripts/capture-baseline-coverage-manifest.json — repair it, or accept named targets deliberately with "npm run evidence:baseline -- --target functional/name/renderer".',
  );
  process.exit(1);
}
