import { computeBoxBlurRadius } from '@flighthq/filters-math';
import { sharpenSurface } from '@flighthq/surface';
import type { SharpenFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Sharpens `source` into `out` using an unsharp mask. `blurX` and `blurY` on
 * the filter are Gaussian standard deviations of the unsharp mask blur.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * `out` must not alias `source.surface.data`.
 */
export function applySharpenFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: SharpenFilter,
): void {
  const quality = filter.quality ?? 1;
  const radiusX = computeBoxBlurRadius(filter.blurX ?? 2, quality);
  const radiusY = computeBoxBlurRadius(filter.blurY ?? 2, quality);
  sharpenSurface(out, blurBuffer, source, {
    amount: filter.amount,
    passes: quality,
    radiusX,
    radiusY,
  });
}
