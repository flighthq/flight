import { computeBoxBlurRadius } from '@flighthq/filters';
import { buildSurfaceGradientRamp, gradientBevelSurface } from '@flighthq/surface';
import type { GradientBevelFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Produces the gradient bevel mask for `source`, writing the result into `out`.
 * The gradient ramp is built from `filter.colors`, `filter.alphas`, and
 * `filter.ratios`. Composite `out` over the original source to complete the effect.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes and
 * must be distinct from `out`. `out` must not alias `source.surface.data`.
 */
export function applyGradientBevelFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: GradientBevelFilter,
): void {
  const ramp = new Uint8ClampedArray(1024);
  buildSurfaceGradientRamp(ramp, filter.colors, filter.alphas, filter.ratios);
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  gradientBevelSurface(out, blurBuffer, source, ramp, {
    angle: filter.angle,
    distance: filter.distance,
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
    type: filter.bevelType === 'full' ? 'both' : filter.bevelType,
  });
}
