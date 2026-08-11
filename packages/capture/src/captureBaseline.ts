import type {
  CaptureBaseline,
  CaptureBaselineField,
  CaptureBaselineProvenance,
  CaptureColumnBaseline,
} from '@flighthq/types/contract';

/** Allocates an empty baseline record. Columns are added via setCaptureBaselineField. */
export function createCaptureBaseline(): CaptureBaseline {
  return {};
}

/**
 * Serializes a baseline to its committed text form: JSON with columns in sorted key order, each
 * column's fields in canonical `fingerprint`, `sourceHash`, then `sha256` order, 2-space indent, and a trailing
 * newline. Matches the tooling's on-disk baseline store byte-for-byte, so a re-baseline of one column
 * produces a minimal diff and the format gate stays green. Only defined fields are emitted.
 */
export function formatCaptureBaseline(baseline: Readonly<CaptureBaseline>): string {
  const sorted: CaptureBaseline = {};
  for (const column of Object.keys(baseline).sort()) {
    const entry = baseline[column];
    const out: CaptureColumnBaseline = {};
    if (entry.fingerprint !== undefined) out.fingerprint = entry.fingerprint;
    if (entry.sourceHash !== undefined) out.sourceHash = entry.sourceHash;
    if (entry.sha256 !== undefined) out.sha256 = entry.sha256;
    // Provenance is emitted LAST so adding it to a column leaves every existing line in place and the
    // diff is one appended block rather than a rewrite of the record.
    if (entry.provenance !== undefined) out.provenance = entry.provenance;
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

/** What produced one column's values, or `null` when the column is absent or predates provenance
 * recording. A missing record reads as UNKNOWN provenance — never as agreement. */
export function getCaptureBaselineProvenance(
  baseline: Readonly<CaptureBaseline>,
  column: string,
): CaptureBaselineProvenance | null {
  return baseline[column]?.provenance ?? null;
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

/** Records what produced one column's values, creating the column entry if it does not yet exist. */
export function setCaptureBaselineProvenance(
  baseline: CaptureBaseline,
  column: string,
  provenance: Readonly<CaptureBaselineProvenance>,
): void {
  (baseline[column] ??= {}).provenance = { ...provenance };
}
