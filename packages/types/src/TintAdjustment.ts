import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';

// A packed-RGBA tint (`0xRRGGBBAA`) expressed as a matrix-tier adjustment: it multiplies each channel of
// the (premultiplied) pixel by the tint's `r,g,b,a / 255`. It bakes to a diagonal-affine 4×5 `colorMatrix`
// — zero bias, no channel mixing — so it fuses with other matrix-tier adjustments and folds into the draw
// as one uniform via the diagonal fast path (`isAffineColorMatrix`). The common single-tint case, authored
// with `createTintAdjustment` / `setNodeColorAdjustmentsTint`.
export interface TintAdjustment extends ColorMatrixAdjustment {
  kind: 'TintAdjustment';
}
