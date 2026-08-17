import type { CaptureBaselineProvenance } from './CaptureBaselineProvenance';

/**
 * The committed baseline values for a single column (backend/renderer) of one capture test. Each field
 * is optional and written independently: `fingerprint` is the coarse render fingerprint (see
 * BitmapFingerprint / compareCaptureFingerprints), and `sha256` is the hash of the encoded screenshot
 * artifact. A column may carry either value, and each value carries its own `*Provenance` recording what
 * produced THAT value, including its scene source. Mirrors the on-disk baseline store's column shape.
 */
export interface CaptureColumnBaseline {
  /** Coarse render fingerprint in the `<gridSize>:<hex>` form (formatBitmapFingerprint). */
  fingerprint?: string;
  /**
   * @deprecated Partial provenance for legacy fingerprints. Readers prefer `fingerprintProvenance` and
   * fall back here only with an explicit PROVENANCE-PARTIAL label. Removed from each column when that
   * column is next written with full fingerprint provenance; no new writer may create it.
   */
  sourceHash?: string;
  // SHA-256 of the ENCODED PNG BYTES of the screenshot — the artifact written to screenshot.png — and
  // NOT of decoded RGBA pixels. It answers "did the encoded artifact change", which is a strictly
  // stronger question than "did the render change": a different encoder producing a visually identical
  // image moves this hash. Anything reasoning about render equality has to know which of the two it is
  // holding, so the distinction is stated here rather than left to the field name.
  sha256?: string;
  /**
   * What produced `fingerprint`. Absent when that value predates provenance recording, or was written
   * by a pass that did not stamp one — which reads as UNKNOWN, never as agreement.
   */
  fingerprintProvenance?: CaptureBaselineProvenance;
  /**
   * What produced `sha256`. Absent under the same conditions and with the same meaning.
   *
   * ★ ONE PER INDEPENDENTLY-WRITTEN VALUE, NOT ONE PER COLUMN. `fingerprint` and `sha256` are written by
   * SEPARATE PASSES, so a single column-level provenance could only ever describe whichever pass wrote it
   * and would silently read as describing both. The deprecated top-level `sourceHash` is retained only
   * as explicitly partial evidence until the fingerprint is naturally recaptured. A value
   * describing N independently-produced things needs N values: one cannot establish agreement between
   * two, it can only report itself.
   */
  sha256Provenance?: CaptureBaselineProvenance;
}
