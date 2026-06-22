import { pixelateSurface } from '@flighthq/surface';
import type { PixelateFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Pixelates `source` into `out`, averaging each block of `filter.blockSize`
 * pixels into a single flat color.
 * `out` must be at least `source.width * source.height * 4` bytes.
 */
export function applyPixelateFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: PixelateFilter,
): void {
  pixelateSurface(out, source, filter.blockSize ?? 8);
}
