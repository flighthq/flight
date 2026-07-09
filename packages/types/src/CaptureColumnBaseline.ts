/**
 * The committed baseline values for a single column (backend/renderer) of one capture test. Each field
 * is optional and written independently: `fingerprint` is the coarse render fingerprint (see
 * SurfaceFingerprint / compareCaptureFingerprints), `sha256` is the exact screenshot hash. A column may
 * carry either, both, or — transiently — neither. Mirrors the on-disk baseline store's column shape.
 */
export interface CaptureColumnBaseline {
  /** Coarse render fingerprint in the `<gridSize>:<hex>` form (formatSurfaceFingerprint). */
  fingerprint?: string;
  /** Exact screenshot hash of the raw decoded RGBA pixels. */
  sha256?: string;
}
