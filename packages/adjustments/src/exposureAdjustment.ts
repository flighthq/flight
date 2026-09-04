import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, ExposureAdjustment, EntityConstruction } from '@flighthq/types/contract';

import { initializeColorMatrixAdjustment } from './colorMatrixAdjustment';

export function createExposureAdjustment(
  options: Readonly<Omit<ExposureAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {},
): ExposureAdjustment {
  const out = allocateEntity<ExposureAdjustment>();
  initializeExposureAdjustment(out, options);
  return finishEntity(out);
}

// Linear exposure as a matrix-tier adjustment: RGB is scaled by `2^exposure` (a per-channel diagonal
// multiply, no offset), reproducing the prior full-frame `rgb·2^exposure` shader. Alpha is unchanged.
// The default rgba8 pipeline clamps the result to [0,1] (matching the fused color-matrix pass's clamp),
// so this is the correct SDR exposure. An unclamped/HDR exposure variant (values >1 into a float target)
// is a future add — it cannot fold through the clamping color-matrix pass and would be its own realization.
// Default exposure 0 is the identity.
export function initializeExposureAdjustment(
  out: EntityConstruction<ExposureAdjustment>,
  options: Readonly<Omit<ExposureAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {},
): void {
  const exposure = options.exposure ?? 0;
  const m = Math.pow(2, exposure);
  // prettier-ignore
  const colorMatrix = [
    m, 0, 0, 0, 0,
    0, m, 0, 0, 0,
    0, 0, m, 0, 0,
    0, 0, 0, 1, 0,
  ];
  initializeColorMatrixAdjustment(out, 'ExposureAdjustment', colorMatrix);
  out.exposure = exposure;
}
