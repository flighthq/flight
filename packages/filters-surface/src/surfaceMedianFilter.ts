import { medianSurface } from '@flighthq/surface';
import type { MedianFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Applies a median filter to `source`, writing the result into `out`.
 * Each output pixel is the median of its neighborhood, preserving edges while
 * removing noise. `out` must not alias `source.surface.data`.
 */
export function applyMedianFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: MedianFilter,
): void {
  medianSurface(out, source, filter.radius ?? 1);
}
