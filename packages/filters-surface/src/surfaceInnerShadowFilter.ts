import { computeBoxBlurRadius } from '@flighthq/filters';
import { innerShadowSurface } from '@flighthq/surface';
import type { InnerShadowFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Produces the inner shadow mask for `source`, writing the result into `out`.
 * To complete the effect, composite the original source first, then composite
 * `out` on top (the inner shadow sits inside the shape boundary).
 *
 * Note: the `angle` and `distance` fields on the filter are not yet applied by
 * the surface path — the shadow is centered on the shape boundary.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * `out` must not alias `source.surface.data`.
 */
export function applyInnerShadowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: InnerShadowFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  innerShadowSurface(out, blurBuffer, source, {
    color: ((filter.color ?? 0x000000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}
