import type { ColorLutAdjustment, ColorTransformFunction } from '@flighthq/types';

import { getAdjustmentColorMatrix } from './colorMatrixAdjustment';

// Returns the rgb→rgb transform a pointwise adjustment contributes to a baked LUT, or null if it is not
// pointwise (a spatial/composite RenderEffect). A LUT-tier adjustment returns its own `transform`; a
// matrix-tier adjustment returns its 4×5 matrix evaluated at opaque alpha (so a mixed run still bakes
// into one LUT). This lets the pipeline fold any pointwise stack — matrices and nonlinear ops together —
// into a single `bakeColorLut` without a per-kind switch.
export function getAdjustmentColorTransform(operation: Readonly<{ kind: string }>): ColorTransformFunction | null {
  const transform = (operation as Readonly<Partial<ColorLutAdjustment>>).transform;
  if (typeof transform === 'function') return transform;
  const matrix = getAdjustmentColorMatrix(operation);
  return matrix === null ? null : colorMatrixTransform(matrix);
}

// Type guard: true when `operation` carries a nonlinear rgb→rgb transform (LUT-tier). Matrix-tier
// adjustments are NOT LUT-tier — they fuse to a matrix — so this is false for them; a run fuses to a LUT
// only when at least one member is a LUT-tier adjustment.
export function isColorLutAdjustment(operation: Readonly<{ kind: string }>): operation is ColorLutAdjustment {
  return typeof (operation as Readonly<Partial<ColorLutAdjustment>>).transform === 'function';
}

// Wraps a 4×5 color matrix (adjustments convention: linear RGBA coefficients + a 0–255 offset column) as
// an rgb→rgb transform on normalized color. Alpha is assumed opaque (1) — the LUT is a 3D rgb cube, so a
// matrix's alpha→rgb coupling is not represented; pure color matrices (the common case) bake exactly.
function colorMatrixTransform(m: Readonly<number[]>): ColorTransformFunction {
  return (out, r, g, b) => {
    out[0] = m[0] * r + m[1] * g + m[2] * b + m[3] + m[4] / 255;
    out[1] = m[5] * r + m[6] * g + m[7] * b + m[8] + m[9] / 255;
    out[2] = m[10] * r + m[11] * g + m[12] * b + m[13] + m[14] / 255;
  };
}
