import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TintAdjustment, EntityConstruction } from '@flighthq/types/contract';

import { initializeColorMatrixAdjustment } from './colorMatrixAdjustment';

export function createTintAdjustment(rgba: number): TintAdjustment {
  const out = allocateEntity<TintAdjustment>();
  initializeTintAdjustment(out, rgba);
  return finishEntity(out);
}

// Builds a diagonal-affine tint from a packed `0xRRGGBBAA` color: each channel scale is that byte
// divided by 255, with zero bias and no channel mixing. Matrix-tier, so it fuses with other adjustments
// and folds through the diagonal fast path. The rgba-ergonomic entry that keeps a tint a single authored
// value; use createColorScaleBiasAdjustment when an explicit per-channel scale/bias bridge is clearer.
export function initializeTintAdjustment(out: EntityConstruction<TintAdjustment>, rgba: number): void {
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
  initializeColorMatrixAdjustment(out, 'TintAdjustment', colorMatrix);
}
