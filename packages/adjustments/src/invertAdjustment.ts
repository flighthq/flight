import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, EntityConstruction } from '@flighthq/entity/contract';

import { initializeColorMatrixAdjustment } from './colorMatrixAdjustment.ts';
import type { InvertAdjustment } from './types.ts';

export function createInvertAdjustment(
  options: Readonly<Omit<InvertAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {},
): InvertAdjustment {
  const out = allocateEntity<InvertAdjustment>();
  initializeInvertAdjustment(out, options);
  return out;
}

// Channel invert as a matrix-tier adjustment. `mix(rgb, 1 - rgb, intensity)` is affine per channel —
// scale `1 - 2·intensity`, normalized-linear bias `intensity`. Alpha is unchanged. At intensity 1
// this is the classic invert (scale −1, bias 1).
export function initializeInvertAdjustment(
  out: EntityConstruction<InvertAdjustment>,
  options: Readonly<Omit<InvertAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {},
): void {
  const intensity = options.intensity ?? 1;
  const s = 1 - 2 * intensity;
  const o = intensity;
  // prettier-ignore
  const colorMatrix = new Float32Array([
    s, 0, 0, 0, o,
    0, s, 0, 0, o,
    0, 0, s, 0, o,
    0, 0, 0, 1, 0,
  ]);
  initializeColorMatrixAdjustment(out, 'InvertAdjustment', colorMatrix);
  out.intensity = intensity;
}
