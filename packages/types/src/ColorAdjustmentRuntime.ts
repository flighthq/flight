import type { Adjustment } from './Adjustment';
import type { ColorTransform } from './ColorTransform';

// Runtime-only pointwise color-adjustment state mixed into renderable node families that support the
// material feature. It does not belong to the bedrock Node runtime: non-rendering nodes carry no
// adjustment stack or resolved cache.
export interface ColorAdjustmentRuntime {
  colorAdjustments: readonly Adjustment[] | null;
  colorAdjustmentsChannelMixing: boolean;
  resolvedColorTransform: ColorTransform | null;
}
