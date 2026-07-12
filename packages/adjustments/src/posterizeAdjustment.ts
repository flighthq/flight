import type { ColorTransformFunction, PosterizeAdjustment } from '@flighthq/types';

// Posterize as a LUT-tier adjustment: quantize each channel to `levels` discrete steps. Ported from the
// old posterizeEffect shader (`floor(c · levels) / (levels - 1)`). The step function is nonlinear, so it
// bakes into a LUT rather than a matrix.
export function createPosterizeAdjustment(
  options: Readonly<Omit<PosterizeAdjustment, 'kind' | 'transform'>> = {},
): PosterizeAdjustment {
  const levels = Math.max(2, options.levels ?? 8);
  const transform: ColorTransformFunction = (out, r, g, b) => {
    out[0] = clamp01(Math.floor(r * levels) / (levels - 1));
    out[1] = clamp01(Math.floor(g * levels) / (levels - 1));
    out[2] = clamp01(Math.floor(b * levels) / (levels - 1));
  };
  return { kind: 'PosterizeAdjustment', ...options, transform };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
