import type { CaptureBaselineProvenance } from './CaptureBaselineProvenance';

/**
 * The committed baseline values for a single column (backend/renderer) of one capture test. Each field
 * is optional and written independently: `fingerprint` is the coarse render fingerprint (see
 * BitmapFingerprint / compareCaptureFingerprints), `sourceHash` identifies the scene source captured by
 * that fingerprint, and `sha256` is the hash of the encoded screenshot artifact. A column may carry any
 * subset of these fields, and `provenance` records what produced them. Mirrors the on-disk baseline
 * store's column shape.
 */
export interface CaptureColumnBaseline {
  /** Coarse render fingerprint in the `<gridSize>:<hex>` form (formatBitmapFingerprint). */
  fingerprint?: string;
  /** SHA-256 of the scene source bytes when `fingerprint` was captured. */
  sourceHash?: string;
  // SHA-256 of the ENCODED PNG BYTES of the screenshot — the artifact written to screenshot.png — and
  // NOT of decoded RGBA pixels. It answers "did the encoded artifact change", which is a strictly
  // stronger question than "did the render change": a different encoder producing a visually identical
  // image moves this hash. Anything reasoning about render equality has to know which of the two it is
  // holding, so the distinction is stated here rather than left to the field name.
  sha256?: string;
  /**
   * What produced the values above. Absent on every column written before this field existed, which
   * reads as unknown provenance rather than as agreement — see CaptureBaselineProvenance.
   */
  provenance?: CaptureBaselineProvenance;
}
