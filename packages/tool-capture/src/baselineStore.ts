// Per-test committed baseline store: one JSON file per test at <subject-root>/baselines/<name>.json,
// holding every column's values, e.g. { "canvas": { "fingerprint": "…", "sha256": "…" }, "flight:webgl": {…} }.
// captureEntry produces each column's `sha256` (screenshot hash); captureValidation produces its
// `fingerprint` (coarse render fingerprint). The normal lifecycle therefore has two stages: sha256-only,
// then paired after validation. Each independently-written value owns its provenance. A join is refused
// only when BOTH provenance records exist and disagree; missing provenance is unknown and remains allowed
// for legacy records. Other columns still use read-merge-write. Output is prettier-compatible (sorted
// keys, 2-space, trailing newline) so it never churns the format gate. Replaces the old
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

export type BaselineField = 'fingerprint' | 'sha256';
export type CaptureBaselineEvidence = Readonly<Omit<CaptureColumnBaseline, 'sourceHash'>> &
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

/**
 * The deprecated source-only fingerprint record, or null. This is deliberately read-only and separate
 * from BaselineField so no generic accessor can turn the legacy field back into a writable API.
 */
export function getBaselineLegacyFingerprintSourceHash(
  root: string,
  subject: string,
  name: string,
  column: string,
): string | null {
  return readBaseline(baselinePath(root, subject, name))[column]?.sourceHash ?? null;
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
 * one record. Optional provenance is copied from the same value rather than preserved from an older
 * column; the deprecated source-only field has no writer here.
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
  assertEvidenceFieldSanity(subject, name, column, 'fingerprint', evidence.fingerprint);
  assertEvidenceFieldSanity(subject, name, column, 'sha256', evidence.sha256);
  assertMatchingProvenance(subject, name, column, evidence.fingerprintProvenance, evidence.sha256Provenance);
  const path = baselinePath(root, subject, name);
  const data = readBaseline(path);
  data[column] = { ...evidence };
  // This operation replaces the fingerprint, so the legacy source-only record can no longer describe
  // it. It is never deleted corpus-wide: cold columns retain their true partial evidence until recaptured.
  delete data[column].sourceHash;
  writeBaseline(path, data);
}

export function setBaselineField(
  root: string,
  subject: string,
  name: string,
  column: string,
  field: BaselineField,
  value: string,
  provenance?: Readonly<CaptureBaselineProvenance>,
): void {
  const path = baselinePath(root, subject, name);
  const data = readBaseline(path);
  if (field === 'fingerprint' || field === 'sha256') {
    assertEvidenceFieldSanity(subject, name, column, field, value);
    assertMatchingProvenance(
      subject,
      name,
      column,
      field === 'fingerprint' ? provenance : getCaptureBaselineProvenance(data, column, 'fingerprint'),
      field === 'sha256' ? provenance : getCaptureBaselineProvenance(data, column, 'sha256'),
    );
  }
  setCaptureBaselineField(data, column, field, value);
  // A new fingerprint can never inherit a source hash recorded for the value it replaces. Normal
  // baseline-writing callers always provide full provenance; this also keeps a lower-level unstamped
  // write honest instead of leaving a now-false partial record behind.
  if (field === 'fingerprint') delete data[column]?.sourceHash;
  if (field === 'fingerprint' || field === 'sha256') {
    if (provenance === undefined) {
      clearCaptureBaselineProvenance(data, column, field);
    } else {
      setCaptureBaselineProvenance(data, column, field, provenance);
    }
  }
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
  assertMatchingProvenance(
    subject,
    name,
    column,
    field === 'fingerprint' ? provenance : getCaptureBaselineProvenance(data, column, 'fingerprint'),
    field === 'sha256' ? provenance : getCaptureBaselineProvenance(data, column, 'sha256'),
  );
  setCaptureBaselineProvenance(data, column, field, provenance);
  if (field === 'fingerprint') delete data[column]?.sourceHash;
  writeBaseline(path, data);
}

function assertEvidenceFieldSanity(
  subject: string,
  name: string,
  column: string,
  field: CaptureBaselineProvenanceField,
  value: string,
): void {
  if (field === 'fingerprint' && isUniformCaptureFingerprint(value)) {
    throw new Error(
      `refusing baseline evidence for ${subject}/${name}/${column}: fingerprint is uniform and cannot distinguish a rendered frame from a blank one`,
    );
  }
  if (field === 'sha256' && isRejectedCaptureBaselineHash(value)) {
    throw new Error(
      `refusing baseline evidence for ${subject}/${name}/${column}: sha256 is a known blank frame (${value.slice(0, 12)}…)`,
    );
  }
}

function assertMatchingProvenance(
  subject: string,
  name: string,
  column: string,
  fingerprint: Readonly<CaptureBaselineProvenance> | null | undefined,
  sha256: Readonly<CaptureBaselineProvenance> | null | undefined,
): void {
  if (fingerprint === null || fingerprint === undefined || sha256 === null || sha256 === undefined) return;
  if (
    fingerprint.frames === sha256.frames &&
    fingerprint.sourceHash === sha256.sourceHash &&
    fingerprint.targetKind === sha256.targetKind &&
    fingerprint.verifyPublished === sha256.verifyPublished &&
    fingerprint.warmupFrames === sha256.warmupFrames
  ) {
    return;
  }
  throw new Error(
    `refusing split baseline provenance for ${subject}/${name}/${column}: fingerprint and sha256 were captured under different conditions`,
  );
}

function clearCaptureBaselineProvenance(
  baseline: CaptureBaseline,
  column: string,
  field: CaptureBaselineProvenanceField,
): void {
  const entry = baseline[column];
  if (entry === undefined) return;
  if (field === 'fingerprint') delete entry.fingerprintProvenance;
  else delete entry.sha256Provenance;
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
