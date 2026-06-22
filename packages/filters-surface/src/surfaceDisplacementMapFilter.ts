import { displaceSurface } from '@flighthq/surface';
import type { DisplacementMapFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Applies a displacement map warp to `source`, writing the result into `out`.
 * `map` supplies the per-pixel displacement vectors; its channels are selected
 * by `filter.componentX` and `filter.componentY`.
 *
 * `out` must not alias `source.surface.data`.
 */
export function applyDisplacementMapFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  map: Readonly<SurfaceRegion>,
  filter: DisplacementMapFilter,
): void {
  displaceSurface(out, source, {
    componentX: filter.componentX,
    componentY: filter.componentY,
    fillColor: ((filter.color ?? 0) << 8) | Math.round((filter.alpha ?? 0) * 255),
    map,
    mode: filter.mode,
    scaleX: filter.scaleX,
    scaleY: filter.scaleY,
  });
}
