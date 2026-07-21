// Per-test committed baseline store: one JSON file per test at <subject-root>/baselines/<name>.json,
// holding every column's values, e.g. { "canvas": { "fingerprint": "…", "sha256": "…" }, "flight:webgl": {…} }.
// captureEntry writes each column's `sha256` (screenshot hash); captureValidation writes its `fingerprint`
// (coarse render fingerprint). Both read-merge-write so they preserve each other's fields and the other
// columns. Output is prettier-compatible (sorted keys, 2-space, trailing newline) so it never churns the
// format gate. Replaces the old tools/baselines/<subject>/<name>/<renderer>/{fingerprint.txt,baseline.sha256}.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  createCaptureBaseline,
  formatCaptureBaseline,
  getCaptureBaselineField,
  parseCaptureBaseline,
  setCaptureBaselineField,
} from '@flighthq/capture';
import type { CaptureBaseline } from '@flighthq/types';

export type BaselineField = 'fingerprint' | 'sha256';

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

export function getBaselineField(
  root: string,
  subject: string,
  name: string,
  column: string,
  field: BaselineField,
): string | null {
  return getCaptureBaselineField(readBaseline(baselinePath(root, subject, name)), column, field);
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
  setCaptureBaselineField(data, column, field, value);
  writeBaseline(path, data);
}

function readBaseline(path: string): CaptureBaseline {
  if (!existsSync(path)) return createCaptureBaseline();
  return parseCaptureBaseline(readFileSync(path, 'utf8')) ?? createCaptureBaseline();
}

// Stable, prettier-compatible serialisation: columns and fields in sorted order so a re-baseline of one
// column produces a minimal diff and the format gate stays green.
function writeBaseline(path: string, data: Readonly<CaptureBaseline>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatCaptureBaseline(data));
}
