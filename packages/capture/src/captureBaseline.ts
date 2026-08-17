import type {
  CaptureBaseline,
  CaptureBaselineField,
  CaptureBaselineProvenance,
  CaptureBaselineProvenanceField,
  CaptureColumnBaseline,
} from '@flighthq/types/contract';

/** Allocates an empty baseline record. Columns are added via setCaptureBaselineField. */
export function createCaptureBaseline(): CaptureBaseline {
  return {};
}

/**
 * Serializes a baseline to its committed text form: JSON with columns in sorted key order, each
 * column's fields in canonical `fingerprint`, deprecated `sourceHash`, then `sha256` order, 2-space
 * indent, and a trailing newline. Matches the tooling's on-disk baseline store byte-for-byte, so a
 * re-baseline of one column
 * produces a minimal diff and the format gate stays green. Only defined fields are emitted.
 */
export function formatCaptureBaseline(baseline: Readonly<CaptureBaseline>): string {
  const sorted: CaptureBaseline = {};
  for (const column of Object.keys(baseline).sort()) {
    const entry = baseline[column];
    const out: CaptureColumnBaseline = {};
    if (entry.fingerprint !== undefined) out.fingerprint = entry.fingerprint;
    // Preserve a legacy partial record on untouched columns. Writers remove it atomically when they
    // install full fingerprintProvenance for this same column.
    if (entry.sourceHash !== undefined) out.sourceHash = entry.sourceHash;
    if (entry.sha256 !== undefined) out.sha256 = entry.sha256;
    // Provenance is emitted LAST so adding it to a column leaves every existing line in place and the
    // diff is one appended block rather than a rewrite of the record.
    if (entry.fingerprintProvenance !== undefined) out.fingerprintProvenance = entry.fingerprintProvenance;
    if (entry.sha256Provenance !== undefined) out.sha256Provenance = entry.sha256Provenance;
    sorted[column] = out;
  }
  return JSON.stringify(sorted, null, 2) + '\n';
}

/**
 * The value of one column's field, or `null` when the column or field is absent. `field` is
 * `'fingerprint'` or `'sha256'`.
 */
export function getCaptureBaselineField(
  baseline: Readonly<CaptureBaseline>,
  column: string,
  field: CaptureBaselineField,
): string | null {
  return baseline[column]?.[field] ?? null;
}

/** What produced ONE of a column's values — `field` names which. `null` when that value is absent or
 * predates provenance recording, which reads as UNKNOWN provenance and never as agreement. */
export function getCaptureBaselineProvenance(
  baseline: Readonly<CaptureBaseline>,
  column: string,
  field: CaptureBaselineProvenanceField,
): CaptureBaselineProvenance | null {
  return baseline[column]?.[provenanceMember(field)] ?? null;
}

/**
 * Parses the text form produced by formatCaptureBaseline. Returns `null` for malformed input — invalid
 * JSON, or a top-level value that is not a plain object — so a corrupt baseline reads as "no baseline"
 * rather than crashing.
 */
export function parseCaptureBaseline(text: string): CaptureBaseline | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  return parsed as CaptureBaseline;
}

/** Sets one column's field to `value`, creating the column entry if it does not yet exist. */
export function setCaptureBaselineField(
  baseline: CaptureBaseline,
  column: string,
  field: CaptureBaselineField,
  value: string,
): void {
  (baseline[column] ??= {})[field] = value;
}

/** Records what produced ONE of a column's values, creating the column entry if it does not yet exist. */
export function setCaptureBaselineProvenance(
  baseline: CaptureBaseline,
  column: string,
  field: CaptureBaselineProvenanceField,
  provenance: Readonly<CaptureBaselineProvenance>,
): void {
  (baseline[column] ??= {})[provenanceMember(field)] = { ...provenance };
}

function provenanceMember(field: CaptureBaselineProvenanceField): 'fingerprintProvenance' | 'sha256Provenance' {
  return field === 'fingerprint' ? 'fingerprintProvenance' : 'sha256Provenance';
}
