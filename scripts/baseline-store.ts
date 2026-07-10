// Per-test committed baseline store: one JSON file per test at <subject-root>/baselines/<name>.json,
// holding every column's values, e.g. { "canvas": { "fingerprint": "…", "sha256": "…" }, "flight:webgl": {…} }.
// capture-core writes each column's `sha256` (screenshot hash); compare-render writes its `fingerprint`
// (coarse render fingerprint). Both read-merge-write so they preserve each other's fields and the other
// columns. Output is prettier-compatible (sorted keys, 2-space, trailing newline) so it never churns the
// format gate. Replaces the old tools/baselines/<subject>/<name>/<renderer>/{fingerprint.txt,baseline.sha256}.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export type BaselineField = 'fingerprint' | 'sha256';
type ColumnBaseline = Partial<Record<BaselineField, string>>;
type TestBaseline = Record<string, ColumnBaseline>;

// Per-subject baseline root: baselines colocate with their suite (functional/examples are
// top-level). One JSON file per test under the root's baselines/ dir.
const BASELINE_ROOTS: Record<string, string> = {
  functional: 'functional',
  examples: 'examples',
};

export function baselinePath(root: string, subject: string, name: string): string {
  const base = BASELINE_ROOTS[subject] ?? subject;
  return join(root, base, 'baselines', `${name}.json`);
}

function readBaseline(path: string): TestBaseline {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as TestBaseline;
  } catch {
    return {};
  }
}

// Stable, prettier-compatible serialisation: columns and fields in sorted order so a re-baseline of one
// column produces a minimal diff and the format gate stays green.
function writeBaseline(path: string, data: TestBaseline): void {
  mkdirSync(dirname(path), { recursive: true });
  const sorted: TestBaseline = {};
  for (const column of Object.keys(data).sort()) {
    const entry = data[column];
    const out: ColumnBaseline = {};
    if (entry.fingerprint !== undefined) out.fingerprint = entry.fingerprint;
    if (entry.sha256 !== undefined) out.sha256 = entry.sha256;
    sorted[column] = out;
  }
  writeFileSync(path, JSON.stringify(sorted, null, 2) + '\n');
}

export function getBaselineField(
  root: string,
  subject: string,
  name: string,
  column: string,
  field: BaselineField,
): string | null {
  return readBaseline(baselinePath(root, subject, name))[column]?.[field] ?? null;
}

export function setBaselineField(
  root: string,
  subject: string,
  name: string,
  column: string,
  field: BaselineField,
  value: string,
): void {
  const path = baselinePath(root, subject, name);
  const data = readBaseline(path);
  (data[column] ??= {})[field] = value;
  writeBaseline(path, data);
}
