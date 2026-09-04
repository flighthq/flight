import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, InvertAdjustment } from '@flighthq/types/contract';

import { initializeColorMatrixAdjustment } from './colorMatrixAdjustment';

// Channel invert as a matrix-tier adjustment. `mix(rgb, 1 - rgb, intensity)` is affine per channel —
// scale `1 - 2·intensity`, normalized-linear bias `intensity`. Alpha is unchanged. At intensity 1
// this is the classic invert (scale −1, bias 1).
export function createInvertAdjustment(
  options: Readonly<Omit<InvertAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {},
): InvertAdjustment {
  const intensity = options.intensity ?? 1;
  const s = 1 - 2 * intensity;
  const o = intensity;
  // prettier-ignore
  const colorMatrix = [
    s, 0, 0, 0, o,
    0, s, 0, 0, o,
    0, 0, s, 0, o,
    0, 0, 0, 1, 0,
  ];
  const out = allocateEntity<InvertAdjustment>();
  initializeColorMatrixAdjustment(out, 'InvertAdjustment', colorMatrix);
  out.intensity = intensity;
  return finishEntity(out);
}
