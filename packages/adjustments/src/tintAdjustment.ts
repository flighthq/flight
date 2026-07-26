import type { TintAdjustment } from '@flighthq/types';

// Builds a diagonal-affine tint from a packed `0xRRGGBBAA` color: each channel multiplier is that byte
// divided by 255, with no offset and no channel mixing. Matrix-tier, so it fuses with other adjustments
// and folds through the diagonal fast path. The rgba-ergonomic entry that keeps a tint a single authored
// value rather than a constructed ColorTransform.
export function createTintAdjustment(rgba: number): TintAdjustment {
  const redMultiplier = ((rgba >>> 24) & 0xff) / 255;
  const greenMultiplier = ((rgba >>> 16) & 0xff) / 255;
  const blueMultiplier = ((rgba >>> 8) & 0xff) / 255;
  const alphaMultiplier = (rgba & 0xff) / 255;
  // prettier-ignore
  const colorMatrix = [
    redMultiplier, 0, 0, 0, 0,
    0, greenMultiplier, 0, 0, 0,
    0, 0, blueMultiplier, 0, 0,
    0, 0, 0, alphaMultiplier, 0,
  ];
  return { kind: 'TintAdjustment', colorMatrix };
}
