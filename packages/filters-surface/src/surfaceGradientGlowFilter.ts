import { computeBoxBlurRadius } from '@flighthq/filters-math';
import { buildSurfaceGradientRamp, gradientGlowSurface } from '@flighthq/surface';
import type { GradientGlowFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Produces the gradient glow mask for `source`, writing the result into `out`.
 * The gradient ramp is built from `filter.colors`, `filter.alphas`, and
 * `filter.ratios`. To complete the effect, composite `out` onto your destination,
 * then composite the original source on top.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyGradientGlowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: GradientGlowFilter,
): void {
  const ramp = new Uint8ClampedArray(1024);
  buildSurfaceGradientRamp(ramp, filter.colors, filter.alphas, filter.ratios);
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  gradientGlowSurface(out, blurBuffer, source, ramp, {
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}
