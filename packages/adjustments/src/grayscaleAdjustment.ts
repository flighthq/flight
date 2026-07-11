import type { GrayscaleAdjustment } from '@flighthq/types';

// Luma desaturation as a matrix-tier adjustment. `mix(rgb, vec3(luma), intensity)` with ITU-R BT.709
// weights is a full affine 3×3 (no offset); alpha is unchanged. At intensity 1 every channel becomes
// the luma. BT.709 (0.2126/0.7152/0.0722) matches the prior full-frame grayscale pass.
export function createGrayscaleAdjustment(
  options: Readonly<Omit<GrayscaleAdjustment, 'kind' | 'colorMatrix'>> = {},
): GrayscaleAdjustment {
  const intensity = options.intensity ?? 1;
  const k = intensity;
  const j = 1 - intensity;
  const lr = 0.2126 * k;
  const lg = 0.7152 * k;
  const lb = 0.0722 * k;
  // prettier-ignore
  const colorMatrix = [
    j + lr, lg, lb, 0, 0,
    lr, j + lg, lb, 0, 0,
    lr, lg, j + lb, 0, 0,
    0, 0, 0, 1, 0,
  ];
  return { kind: 'GrayscaleAdjustment', ...options, colorMatrix };
}
