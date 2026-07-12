import type { ExposureAdjustment } from '@flighthq/types';

// Linear exposure as a matrix-tier adjustment: RGB is scaled by `2^exposure` (a per-channel diagonal
// multiply, no offset), reproducing the prior full-frame `rgb·2^exposure` shader. Alpha is unchanged.
// The default rgba8 pipeline clamps the result to [0,1] (matching the fused color-matrix pass's clamp),
// so this is the correct SDR exposure. An unclamped/HDR exposure variant (values >1 into a float target)
// is a future add — it cannot fold through the clamping color-matrix pass and would be its own realization.
// Default exposure 0 is the identity.
export function createExposureAdjustment(
  options: Readonly<Omit<ExposureAdjustment, 'kind' | 'colorMatrix'>> = {},
): ExposureAdjustment {
  const m = Math.pow(2, options.exposure ?? 0);
  // prettier-ignore
  const colorMatrix = [
    m, 0, 0, 0, 0,
    0, m, 0, 0, 0,
    0, 0, m, 0, 0,
    0, 0, 0, 1, 0,
  ];
  return { kind: 'ExposureAdjustment', ...options, colorMatrix };
}
