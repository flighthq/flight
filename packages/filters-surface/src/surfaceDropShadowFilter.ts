import { computeBoxBlurRadius } from '@flighthq/filters-math';
import { dropShadowSurface } from '@flighthq/surface';
import type { DropShadowFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Produces the drop shadow mask for `source`, writing the tinted blurred alpha
 * mask into `out`. To complete the effect, composite `out` onto your destination
 * at the shadow offset (see `getShadowFilterOffset`), then composite the original
 * source on top (omit if `filter.hideObject` is true).
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyDropShadowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: DropShadowFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  dropShadowSurface(out, blurBuffer, source, {
    color: ((filter.color ?? 0x000000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}
