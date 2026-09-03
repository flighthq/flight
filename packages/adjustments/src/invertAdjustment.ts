import type { NonEntityCreateResult } from '@flighthq/types/contract';
import type { InvertAdjustment } from '@flighthq/types/contract';

// Channel invert as a matrix-tier adjustment. `mix(rgb, 1 - rgb, intensity)` is affine per channel —
// scale `1 - 2·intensity`, normalized-linear bias `intensity`. Alpha is unchanged. At intensity 1
// this is the classic invert (scale −1, bias 1).
export function createInvertAdjustment(
  options: Readonly<Omit<InvertAdjustment, 'kind' | 'colorMatrix'>> = {},
): NonEntityCreateResult<InvertAdjustment, 'descriptor'> {
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
  return { kind: 'InvertAdjustment', ...options, colorMatrix };
}
