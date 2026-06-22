import { computeBoxBlurRadius } from '@flighthq/filters';
import { bevelSurface } from '@flighthq/surface';
import type { BevelFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Applies a bevel filter to `source`, writing the bevel mask into `out`.
 * Composite `out` over the original source to complete the effect.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes and
 * must be distinct from `out`. `out` must not alias `source.surface.data`.
 */
export function applyBevelFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: BevelFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 4, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 4, quality);
  const highlightColor = ((filter.highlightColor ?? 0xffffff) << 8) | Math.round((filter.highlightAlpha ?? 1) * 255);
  const shadowColor = ((filter.shadowColor ?? 0x000000) << 8) | Math.round((filter.shadowAlpha ?? 1) * 255);
  bevelSurface(out, blurBuffer, source, {
    angle: filter.angle,
    distance: filter.distance,
    highlightColor,
    intensity: filter.strength,
    passes: quality,
    radiusX,
    radiusY,
    shadowColor,
    type: filter.bevelType === 'full' ? 'both' : filter.bevelType,
  });
}
