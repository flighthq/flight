import { computeBoxBlurRadius } from '@flighthq/filters';
import { glowSurface } from '@flighthq/surface';
import type { OuterGlowFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Produces the outer glow mask for `source`, writing the tinted blurred alpha
 * mask into `out`. To complete the effect, composite `out` onto your destination
 * first, then composite the original source on top (omit if `filter.knockout` is true).
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyOuterGlowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: OuterGlowFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 6, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 6, quality);
  glowSurface(out, blurBuffer, source, {
    color: ((filter.color ?? 0xff0000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}
