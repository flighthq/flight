import { gaussianBlurSurface } from '@flighthq/surface';
import type { BlurFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Applies a true Gaussian blur to `source`, writing the blurred result into `out`. `blurX` and
 * `blurY` on the filter are the Gaussian standard deviations in pixels (matching CSS `blur()`),
 * so the BlurFilter intent renders the same on the surface, CSS, and Gl Gaussian paths. For a
 * cheaper box approximation, call `boxBlurSurface` from `@flighthq/surface` directly.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function applyBlurFilterToSurface(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: BlurFilter,
): void {
  gaussianBlurSurface(out, blurBuffer, source, filter.blurX ?? 4, filter.blurY ?? 4);
}
