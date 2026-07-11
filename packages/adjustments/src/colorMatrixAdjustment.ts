import type { ColorMatrixAdjustment } from '@flighthq/types';

import { COLOR_MATRIX_LENGTH } from './colorMatrixMath';

// Returns the 4×5 color matrix a stack operation contributes to the fused matrix-tier pass, or null if
// it is not a matrix-tier adjustment (a spatial/composite RenderEffect, or a LUT-tier adjustment). Lets
// a pipeline recognise which stack entries fold into the single generic color-matrix pass without a
// per-kind switch: any operation carrying a valid 4×5 `colorMatrix` fuses, third-party ones included.
export function getAdjustmentColorMatrix(operation: Readonly<{ kind: string }>): readonly number[] | null {
  const matrix = (operation as Readonly<Partial<ColorMatrixAdjustment>>).colorMatrix;
  return Array.isArray(matrix) && matrix.length === COLOR_MATRIX_LENGTH ? matrix : null;
}

// Type guard: true when `operation` contributes a fusable 4×5 color matrix.
export function isColorMatrixAdjustment(operation: Readonly<{ kind: string }>): operation is ColorMatrixAdjustment {
  return getAdjustmentColorMatrix(operation) !== null;
}
