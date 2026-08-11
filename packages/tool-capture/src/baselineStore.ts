// Per-test committed baseline store: one JSON file per test at <subject-root>/baselines/<name>.json,
// holding every column's values, e.g. { "canvas": { "fingerprint": "…", "sha256": "…" }, "flight:webgl": {…} }.
// captureEntry produces each column's `sha256` (screenshot hash); captureValidation produces its
// `fingerprint` (coarse render fingerprint). The normal lifecycle writes those fields in separate passes,
// so a one-sided record is a valid first stage and either pass must remain independently writable. Other
// columns still use read-merge-write. Output is prettier-compatible (sorted keys, 2-space, trailing newline)
// so it never churns the format gate. Replaces the old
// tools/baselines/<subject>/<name>/<renderer>/{fingerprint.txt,baseline.sha256}.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  createCaptureBaseline,
  formatCaptureBaseline,
  getCaptureBaselineField,
  getCaptureBaselineProvenance,
  parseCaptureBaseline,
  setCaptureBaselineField,
  setCaptureBaselineProvenance,
} from '@flighthq/capture/contract';
import type {
  CaptureBaseline,
  CaptureBaselineProvenance,
  CaptureBaselineProvenanceField,
  CaptureColumnBaseline,
} from '@flighthq/types/contract';

import { isRejectedCaptureBaselineHash, isUniformCaptureFingerprint } from './captureBaselineSanity.js';

export type BaselineField = 'fingerprint' | 'sourceHash' | 'sha256';
export type CaptureBaselineEvidence = Readonly<CaptureColumnBaseline> &
  Required<Pick<CaptureColumnBaseline, 'fingerprint' | 'sha256'>>;

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

// What produced ONE of a column's committed values — `field` names which — or null when that value
// predates provenance recording. Reads as UNKNOWN, never as agreement.
export function getBaselineProvenance(
  root: string,
  subject: string,
  name: string,
  column: string,
  field: CaptureBaselineProvenanceField,
): CaptureBaselineProvenance | null {
  return getCaptureBaselineProvenance(readBaseline(baselinePath(root, subject, name)), column, field);
}

/**
 * Replaces one column's captured evidence in a single read/write transaction. Fingerprint and exact
 * screenshot hash are required together so the store cannot attribute two independent capture passes to
 * one record. Optional evidence such as source/provenance is copied from the same value rather than
 * preserved from an older column.
 */
export function setBaselineCaptureEvidence(
  root: string,
  subject: string,
  name: string,
  column: string,
  evidence: CaptureBaselineEvidence,
): void {
  if (typeof evidence.fingerprint !== 'string' || typeof evidence.sha256 !== 'string') {
    throw new Error(
      `refusing incomplete baseline evidence for ${subject}/${name}/${column}: fingerprint and sha256 must be written together`,
    );
  }
  if (isUniformCaptureFingerprint(evidence.fingerprint)) {
    throw new Error(
      `refusing baseline evidence for ${subject}/${name}/${column}: fingerprint is uniform and cannot distinguish a rendered frame from a blank one`,
    );
  }
  if (isRejectedCaptureBaselineHash(evidence.sha256)) {
    throw new Error(
      `refusing baseline evidence for ${subject}/${name}/${column}: sha256 is a known blank frame (${evidence.sha256.slice(0, 12)}…)`,
    );
  }
  const path = baselinePath(root, subject, name);
  const data = readBaseline(path);
  data[column] = { ...evidence };
  writeBaseline(path, data);
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

// Records what produced ONE of a column's values. Read-merge-write like the field setter, so it leaves
// every other column and every other field of this one untouched — no existing record is rewritten.
export function setBaselineProvenance(
  root: string,
  subject: string,
  name: string,
  column: string,
  field: CaptureBaselineProvenanceField,
  provenance: Readonly<CaptureBaselineProvenance>,
): void {
  const path = baselinePath(root, subject, name);
  const data = readBaseline(path);
  setCaptureBaselineProvenance(data, column, field, provenance);
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
