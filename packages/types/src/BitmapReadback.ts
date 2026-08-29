// Plain-data answer to "why did createBitmapFromImageSource return null?", the pull half of the
// diagnostics convention for CPU readback. Recomputed on demand by explainBitmapReadback against the
// same seam the constructor uses, holding no reference to the source. Format for humans in a separate
// format* companion, never here.
export interface BitmapReadbackExplanation {
  // The readback would succeed. When false, createBitmapFromImageSource returns null for `reason`.
  readonly readable: boolean;
  readonly reason: BitmapReadbackBlockReason;
}

// `ok` — the readback succeeds.
// `tainted-source` — the source is cross-origin without CORS approval, so drawing it taints the
//   scratch canvas and the platform refuses to hand back its pixels. A same-origin source, or a
//   cross-origin one served with permissive CORS headers and requested with `crossOrigin`, is
//   readable; nothing about the image itself can be changed after the fact to make it so.
// `backend-not-installed` — no host or custom readback backend has been enabled.
// `no-canvas` — the selected backend cannot allocate a 2D scratch canvas in this host.
// `empty-size` — the requested capture is zero or negative in a dimension, so there are no pixels to
//   read. Distinguished from a failure because it is a caller arithmetic error, not a platform one.
export type BitmapReadbackBlockReason = 'backend-not-installed' | 'empty-size' | 'no-canvas' | 'ok' | 'tainted-source';
