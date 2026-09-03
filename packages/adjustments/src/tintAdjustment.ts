import type { NonEntityCreateResult } from '@flighthq/types/contract';
import type { TintAdjustment } from '@flighthq/types/contract';

// Builds a diagonal-affine tint from a packed `0xRRGGBBAA` color: each channel scale is that byte
// divided by 255, with zero bias and no channel mixing. Matrix-tier, so it fuses with other adjustments
// and folds through the diagonal fast path. The rgba-ergonomic entry that keeps a tint a single authored
// value; use createColorScaleBiasAdjustment when an explicit per-channel scale/bias bridge is clearer.
export function createTintAdjustment(rgba: number): NonEntityCreateResult<TintAdjustment, 'descriptor'> {
  const redScale = ((rgba >>> 24) & 0xff) / 255;
  const greenScale = ((rgba >>> 16) & 0xff) / 255;
  const blueScale = ((rgba >>> 8) & 0xff) / 255;
  const alphaScale = (rgba & 0xff) / 255;
  // prettier-ignore
  const colorMatrix = [
    redScale, 0, 0, 0, 0,
    0, greenScale, 0, 0, 0,
    0, 0, blueScale, 0, 0,
    0, 0, 0, alphaScale, 0,
  ];
  return { kind: 'TintAdjustment', colorMatrix };
}
