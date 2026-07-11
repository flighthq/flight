import type { SepiaAdjustment } from '@flighthq/types';

// Sepia tone as a matrix-tier adjustment. `mix(rgb, sepia·rgb, intensity)` is affine 3×3 (no offset);
// alpha is unchanged. At intensity 1 this is the standard sepia matrix used across CSS/Flash.
export function createSepiaAdjustment(
  options: Readonly<Omit<SepiaAdjustment, 'kind' | 'colorMatrix'>> = {},
): SepiaAdjustment {
  const k = options.intensity ?? 1;
  const j = 1 - k;
  // prettier-ignore
  const colorMatrix = [
    j + 0.393 * k, 0.769 * k, 0.189 * k, 0, 0,
    0.349 * k, j + 0.686 * k, 0.168 * k, 0, 0,
    0.272 * k, 0.534 * k, j + 0.131 * k, 0, 0,
    0, 0, 0, 1, 0,
  ];
  return { kind: 'SepiaAdjustment', ...options, colorMatrix };
}
