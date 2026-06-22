import { computeBoxBlurRadius } from '@flighthq/filters';
import { innerGlowSurface } from '@flighthq/surface';
import type { InnerGlowFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Produces the inner glow mask for `source`, writing the result into `out`.
 * To complete the effect, composite the original source first, then composite
 * `out` on top (the inner glow sits inside the shape boundary).
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * `out` must not alias `source.surface.data`.
 */
export function applyInnerGlowFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: InnerGlowFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 6, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 6, quality);
  innerGlowSurface(out, blurBuffer, source, {
    color: ((filter.color ?? 0xff0000) << 8) | Math.round((filter.alpha ?? 1) * 255),
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
  });
}
