import type { SurfaceRegion } from '@flighthq/types';

import { applySurfaceBoxBlurFilter } from './blur';

export interface SurfaceSharpenFilterOptions {
  /** Sharpen strength. 0 is a no-op; 1 is a moderate sharpen; >1 is stronger. Default 1. */
  amount?: number;
  /** Blur radius of the unsharp mask, in pixels. Larger radii sharpen coarser detail. Default 2. */
  radiusX?: number;
  radiusY?: number;
  /** Blur pass count, forwarded to the box blur. Default 1. */
  passes?: number;
}

/**
 * Sharpens `source` into `out` using an unsharp mask: it blurs the source, then
 * adds back `amount × (source − blurred)` so edges are accentuated. This is the
 * radius-based sharpen photo tools use; a fixed 3×3 sharpen is also available
 * via `applySurfaceConvolutionFilter`.
 *
 * `scratch` is ping-pong scratch, at least `source.width * source.height * 4`
 * bytes; its contents are undefined after the call. Alpha is left as the source
 * alpha (only RGB is sharpened).
 *
 * `out` must NOT alias `source.surface.data`: `out` holds the blurred image
 * while the original source pixels are read again to form the mask.
 */
export function applySurfaceSharpenFilter(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceSharpenFilterOptions> = {},
): void {
  const amount = options.amount ?? 1;
  applySurfaceBoxBlurFilter(out, scratch, source, {
    radiusX: options.radiusX ?? 2,
    radiusY: options.radiusY ?? 2,
    passes: options.passes ?? 1,
  });

  const w = source.width;
  const h = source.height;
  const surfaceWidth = source.surface.width;
  const surfaceHeight = source.surface.height;
  const data = source.surface.data;
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    if (sy < 0 || sy >= surfaceHeight) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      if (sx < 0 || sx >= surfaceWidth) continue;
      const si = (sy * surfaceWidth + sx) * 4;
      const di = (py * w + px) * 4;
      const r = data[si];
      const g = data[si + 1];
      const b = data[si + 2];
      out[di] = r + amount * (r - out[di]);
      out[di + 1] = g + amount * (g - out[di + 1]);
      out[di + 2] = b + amount * (b - out[di + 2]);
      out[di + 3] = data[si + 3];
    }
  }
}
