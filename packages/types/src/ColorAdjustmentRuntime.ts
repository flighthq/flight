import type { Adjustment } from './Adjustment';
import type { ColorScaleBias } from './ColorScaleBias';

// Pointwise color-adjustment authoring and its fused bind caches live on the base Node runtime so one
// dimension-agnostic API serves 2D and 3D. Null is the allocation-free untinted default.
export interface ColorAdjustmentRuntime {
  colorAdjustments: readonly Adjustment[] | null;
  // True only when the stack contains a non-matrix operation that neither compact nor 4×5 data can carry.
  colorAdjustmentsUnsupported: boolean;
  // Full fused 4×5 matrix when the stack mixes channels; null for the common diagonal-affine path.
  resolvedColorMatrix: readonly number[] | null;
  resolvedColorScaleBias: ColorScaleBias | null;
}
