import { colorMatrixSurface } from '@flighthq/surface';
import type { ColorMatrixFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Applies a 4×5 color matrix to `source`, writing the result into `out`.
 * `out` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyColorMatrixFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: ColorMatrixFilter,
): void {
  colorMatrixSurface(out, source, filter.matrix);
}
