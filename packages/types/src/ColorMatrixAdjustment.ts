import type { Adjustment } from './Adjustment';

// A matrix-tier adjustment: its pointwise value remap is a pure affine 4×5 color matrix (the
// @flighthq/adjustments colorMatrixMath convention — linear RGBA coefficients with a 0–255 offset
// column). Carrying `colorMatrix` is what makes an adjustment matrix-tier and fusable, independent of
// `kind`: a run of consecutive matrix-tier adjustments in an effect stack composes into ONE matrix
// (concatColorMatrix) and folds into a single generic color-matrix pass, never one pass per op. A
// third-party adjustment that contributes a `colorMatrix` fuses through the same path.
export interface ColorMatrixAdjustment extends Adjustment {
  colorMatrix: readonly number[];
}
