import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';

// Linear exposure as a matrix-tier adjustment: a `2^exposure` scalar multiply on RGB. The baked matrix
// runs through the default rgba8 pipeline, which clamps to [0,1] — correct SDR exposure. An unclamped
// HDR exposure variant (writing values >1 to a float target) is a future add; it cannot fold through
// the clamping color-matrix pass and would be its own realization.
export interface ExposureAdjustment extends ColorMatrixAdjustment {
  kind: 'ExposureAdjustment';
  exposure?: number; // stops, applied as 2^exposure. Default 0 (identity).
}
