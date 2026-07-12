import type { Adjustment } from './Adjustment';
import type { ColorTransformFunction } from './ColorTransformFunction';

// A LUT-tier adjustment: its pointwise value remap is an arbitrary rgb→rgb function (`transform`), not a
// pure affine matrix. Carrying `transform` is what makes an adjustment LUT-tier, independent of `kind`: a
// run of consecutive pointwise adjustments containing any LUT-tier member bakes the WHOLE run (matrices
// folded in) into one ColorLut and applies it in a single trilinear pass, never one pass per op. A
// third-party adjustment that contributes a `transform` fuses through the same path.
export interface ColorLutAdjustment extends Adjustment {
  transform: ColorTransformFunction;
}
