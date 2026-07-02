import { computeBoxBlurRadius, getShadowFilterOffset } from '@flighthq/filters-math';
import { innerShadowSurface } from '@flighthq/surface';
import type { InnerShadowFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Produces the inner shadow mask for `source`, writing the result into `out`.
 * To complete the effect, composite the original source first, then composite
 * `out` on top (the inner shadow sits inside the shape boundary).
 *
 * The `angle` and `distance` fields offset the shadow within the shape (via
 * getShadowFilterOffset): the shadow gathers against the edge the offset points
 * away from, rather than ringing the whole boundary. Zero distance centers it.
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
  const offset = getShadowFilterOffset(filter, { dx: 0, dy: 0 });
  innerShadowSurface(out, blurBuffer, source, {
    color: ((filter.color ?? 0x000000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    offsetX: offset.dx,
    offsetY: offset.dy,
    passes: quality,
    radiusX,
    radiusY,
  });
}
