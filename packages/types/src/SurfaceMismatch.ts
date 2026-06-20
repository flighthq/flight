/**
 * The result of a tolerant pixel comparison of two equally sized surfaces (see getSurfaceMismatch).
 * A pixel counts as mismatched when its largest RGBA channel difference exceeds the comparison's
 * per-channel tolerance. Used for cross-backend differential checks and regression gates that must
 * allow sub-pixel antialiasing noise while still catching real divergence.
 */
export interface SurfaceMismatch {
  /** Pixels whose maximum channel difference exceeded the tolerance. */
  readonly mismatchedPixels: number;
  /** Total pixels compared (width × height). */
  readonly totalPixels: number;
  /** mismatchedPixels / totalPixels, in the range 0..1. */
  readonly fraction: number;
  /** The largest single-channel absolute difference seen across all pixels, 0..255. */
  readonly maxChannelDelta: number;
}
