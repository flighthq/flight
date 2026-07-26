import type { Adjustment, ColorScaleBias } from '@flighthq/types/contract';

import { getAdjustmentColorMatrix } from './colorMatrixAdjustment';
import { fuseColorMatrices } from './colorMatrixMath';

// Resolution status of a node's color-adjustment stack against the affine inline fold.
export const COLOR_ADJUSTMENT_NONE = 0; // empty stack — no tint (leave `out` untouched, use null)
export const COLOR_ADJUSTMENT_AFFINE = 1; // fully representable as one 8-float ColorScaleBias
export const COLOR_ADJUSTMENT_CHANNEL_MIXING = 2; // a full matrix or unsupported non-matrix op is present

// True when `matrix` has no off-diagonal RGB/A coefficients, i.e. it is a per-channel scale + bias that
// an 8-float ColorScaleBias can represent exactly. A diagonal-affine matrix is `[m0,·,·,·,bias, ·,m6,·,·,
// bias, ·,·,m12,·,bias, ·,·,·,m18,bias]`. Fusing diagonal matrices stays diagonal, so this stays an exact
// zero check.
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

// Resolves a stack to its complete fused 4×5 matrix when every member is matrix-tier. Returns null
// for an empty stack or when a non-matrix operation (for example a LUT) prevents exact inline fusion.
export function resolveColorAdjustmentsColorMatrix(adjustments: readonly Adjustment[] | null): number[] | null {
  if (adjustments === null || adjustments.length === 0) return null;
  const matrices: Readonly<number[]>[] = [];
  for (let i = 0; i < adjustments.length; i++) {
    const matrix = getAdjustmentColorMatrix(adjustments[i]);
    if (matrix === null) return null;
    matrices.push(matrix);
  }
  return fuseColorMatrices(matrices);
}

// Fuses a node's color-adjustment stack into the single affine `ColorScaleBias` the inline fold consumes,
// writing per-channel scale + normalized-linear bias into `out`, and returns the resolution status:
//
//   COLOR_ADJUSTMENT_NONE           — empty/null stack; `out` untouched (the caller uses null → no tint).
//   COLOR_ADJUSTMENT_AFFINE         — the fused stack is diagonal-affine; `out` is exact.
//   COLOR_ADJUSTMENT_CHANNEL_MIXING — the fused matrix carries off-diagonal channel-mixing terms
//                                     (saturation/hue/sepia/channelMixer) or a non-matrix (LUT) op that the
//                                     8-float fold cannot represent yet. `out` holds only the affine part
//                                     (diagonal + bias); the caller can resolve the complete matrix.
//
// A single TintAdjustment or generic affine color matrix resolves through the same fused matrix path.
// Matrix-tier ops fuse order-preserving via concatColorMatrix; a non-matrix op marks the stack non-affine.
export function resolveColorAdjustmentsColorScaleBias(
  adjustments: readonly Adjustment[] | null,
  out: ColorScaleBias,
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
  out.redScale = fused[0];
  out.greenScale = fused[6];
  out.blueScale = fused[12];
  out.alphaScale = fused[18];
  out.redBias = fused[4];
  out.greenBias = fused[9];
  out.blueBias = fused[14];
  out.alphaBias = fused[19];

  return inlineable && isAffineColorMatrix(fused) ? COLOR_ADJUSTMENT_AFFINE : COLOR_ADJUSTMENT_CHANNEL_MIXING;
}
