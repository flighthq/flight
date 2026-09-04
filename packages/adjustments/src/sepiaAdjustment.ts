import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, SepiaAdjustment, EntityConstruction } from '@flighthq/types/contract';

import { initializeColorMatrixAdjustment } from './colorMatrixAdjustment';

export function createSepiaAdjustment(
  options: Readonly<Omit<SepiaAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {},
): SepiaAdjustment {
  const out = allocateEntity<SepiaAdjustment>();
  initializeSepiaAdjustment(out, options);
  return finishEntity(out);
}

// Sepia tone as a matrix-tier adjustment. `mix(rgb, sepia·rgb, intensity)` is affine 3×3 (no offset);
// alpha is unchanged. At intensity 1 this is the standard sepia matrix used across CSS/Flash.
export function initializeSepiaAdjustment(
  out: EntityConstruction<SepiaAdjustment>,
  options: Readonly<Omit<SepiaAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {},
): void {
  const intensity = options.intensity ?? 1;
  const k = intensity;
  const j = 1 - k;
  // prettier-ignore
  const colorMatrix = [
    j + 0.393 * k, 0.769 * k, 0.189 * k, 0, 0,
    0.349 * k, j + 0.686 * k, 0.168 * k, 0, 0,
    0.272 * k, 0.534 * k, j + 0.131 * k, 0, 0,
    0, 0, 0, 1, 0,
  ];
  initializeColorMatrixAdjustment(out, 'SepiaAdjustment', colorMatrix);
  out.intensity = intensity;
}
