import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';
import type { ColorTransform } from './ColorTransform';

// The node-level color transform expressed as a matrix-tier adjustment — one member of a node's generic
// color-adjustment stack, no longer a privileged entity trait. It carries the 8-field `ColorTransform`
// payload (per-channel multiply + 0–255 offset) and bakes it to a diagonal-affine 4×5 `colorMatrix`, so a
// stack of it and other matrix-tier adjustments fuses (concatColorMatrix) into one matrix. The inline fold
// resolves the fused stack back to a single affine `ColorTransform` (the `a_ctMult`/`u_ctMult` stage). It
// is not a Material and never keys the batch.
export interface ColorTransformAdjustment extends ColorMatrixAdjustment {
  kind: 'ColorTransformAdjustment';
  colorTransform: ColorTransform;
}
