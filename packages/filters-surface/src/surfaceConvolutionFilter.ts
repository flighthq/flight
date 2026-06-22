import { convolveSurface } from '@flighthq/surface';
import type { ConvolutionFilter, SurfaceRegion } from '@flighthq/types';

/**
 * Applies a kernel convolution to `source`, writing the result into `out`.
 * `out` must not alias `source.surface.data`.
 */
export function applyConvolutionFilterToSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  filter: ConvolutionFilter,
): void {
  convolveSurface(out, source, {
    bias: filter.bias,
    divisor: filter.divisor,
    matrix: filter.matrix,
    matrixX: filter.matrixX,
    matrixY: filter.matrixY,
    preserveAlpha: filter.preserveAlpha,
  });
}
