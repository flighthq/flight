import type { Adjustment, ColorTransform } from '@flighthq/types';

import { getAdjustmentColorMatrix } from './colorMatrixAdjustment';
import { fuseColorMatrices } from './colorMatrixMath';

// Resolution status of a node's color-adjustment stack against the affine inline fold.
export const COLOR_ADJUSTMENT_NONE = 0; // empty stack — no tint (leave `out` untouched, use null)
export const COLOR_ADJUSTMENT_AFFINE = 1; // fully representable as one 8-float ColorTransform
export const COLOR_ADJUSTMENT_CHANNEL_MIXING = 2; // off-diagonal terms present — `out` holds only the affine part

// True when `matrix` has no off-diagonal RGB/A coefficients, i.e. it is a per-channel scale + offset that
// an 8-float ColorTransform can represent exactly. A diagonal-affine matrix is `[m0,·,·,·,off, ·,m6,·,·,off,
// ·,·,m12,·,off, ·,·,·,m18,off]`. Fusing diagonal matrices stays diagonal, so this stays an exact zero check.
export function isAffineColorMatrix(matrix: Readonly<number[]>): boolean {
  return (
    matrix[1] === 0 &&
    matrix[2] === 0 &&
    matrix[3] === 0 &&
    matrix[5] === 0 &&
    matrix[7] === 0 &&
    matrix[8] === 0 &&
    matrix[10] === 0 &&
    matrix[11] === 0 &&
    matrix[13] === 0 &&
    matrix[15] === 0 &&
    matrix[16] === 0 &&
    matrix[17] === 0
  );
}

// Fuses a node's color-adjustment stack into the single affine `ColorTransform` the inline fold consumes,
// writing per-channel multiply + 0–255 offset into `out`, and returns the resolution status:
//
//   COLOR_ADJUSTMENT_NONE           — empty/null stack; `out` untouched (the caller uses null → no tint).
//   COLOR_ADJUSTMENT_AFFINE         — the fused stack is diagonal-affine; `out` is exact.
//   COLOR_ADJUSTMENT_CHANNEL_MIXING — the fused matrix carries off-diagonal channel-mixing terms
//                                     (saturation/hue/sepia/channelMixer) or a non-matrix (LUT) op that the
//                                     8-float fold cannot represent yet. `out` holds only the affine part
//                                     (diagonal + offset); the caller routes this to the deferral guard.
//
// A single ColorTransformAdjustment (the common per-object case) resolves exactly with no matrix multiply.
// Matrix-tier ops fuse order-preserving via concatColorMatrix; a non-matrix op marks the stack non-affine.
export function resolveColorAdjustmentsColorTransform(
  adjustments: readonly Adjustment[] | null,
  out: ColorTransform,
): number {
  if (adjustments === null || adjustments.length === 0) return COLOR_ADJUSTMENT_NONE;

  const matrices: Readonly<number[]>[] = [];
  let inlineable = true;
  for (let i = 0; i < adjustments.length; i++) {
    const matrix = getAdjustmentColorMatrix(adjustments[i]);
    if (matrix === null) inlineable = false;
    else matrices.push(matrix);
  }

  const fused = fuseColorMatrices(matrices);
  out.redMultiplier = fused[0];
  out.greenMultiplier = fused[6];
  out.blueMultiplier = fused[12];
  out.alphaMultiplier = fused[18];
  out.redOffset = fused[4];
  out.greenOffset = fused[9];
  out.blueOffset = fused[14];
  out.alphaOffset = fused[19];

  return inlineable && isAffineColorMatrix(fused) ? COLOR_ADJUSTMENT_AFFINE : COLOR_ADJUSTMENT_CHANNEL_MIXING;
}
