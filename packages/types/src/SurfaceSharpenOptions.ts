export interface SurfaceSharpenOptions {
  /** Sharpen strength. 0 is a no-op; 1 is a moderate sharpen; >1 is stronger. Default 1. */
  amount?: number;
  /** Blur radius of the unsharp mask, in pixels. Larger radii sharpen coarser detail. Default 2. */
  radiusX?: number;
  radiusY?: number;
  /** Blur pass count, forwarded to the box blur. Default 1. */
  passes?: number;
}
