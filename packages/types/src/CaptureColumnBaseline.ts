/**
 * The committed baseline values for a single column (backend/renderer) of one capture test. Each field
 * is optional and written independently: `fingerprint` is the coarse render fingerprint (see
 * BitmapFingerprint / compareCaptureFingerprints), `sourceHash` identifies the scene source captured by
 * that fingerprint, and `sha256` is the exact screenshot hash. A column may carry any subset of these
 * fields. Mirrors the on-disk baseline store's column shape.
 */
export interface CaptureColumnBaseline {
  /** Coarse render fingerprint in the `<gridSize>:<hex>` form (formatBitmapFingerprint). */
  fingerprint?: string;
  /** SHA-256 of the scene source bytes when `fingerprint` was captured. */
  sourceHash?: string;
  /** Exact screenshot hash of the raw decoded RGBA pixels. */
  sha256?: string;
}
