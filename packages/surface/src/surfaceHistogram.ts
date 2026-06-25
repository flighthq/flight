import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceHistogram, SurfaceRegion } from '@flighthq/types';

import { applySurfacePaletteMap } from './surfacePaletteMap';

/**
 * Applies histogram equalization to `source`, writing into `dest`. Each RGB
 * channel is equalized independently using its cumulative distribution function,
 * spreading the tonal range across the full 0..255 output. The alpha channel is
 * copied unchanged.
 *
 * Safe to pass the same surface and region in `dest` and `source` for in-place
 * equalization (the palette map reads each pixel before writing it).
 */
export function equalizeSurfaceHistogram(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  const histogram = getSurfaceHistogram(source);
  const total = source.width * source.height;

  applySurfacePaletteMap(
    dest,
    source,
    buildEqualizeMap(histogram.red, total),
    buildEqualizeMap(histogram.green, total),
    buildEqualizeMap(histogram.blue, total),
    null,
  );
  invalidateImageResource(dest.surface);
}

/**
 * Counts how many pixels in the `source` region fall into each 0..255 value,
 * per channel, and returns four 256-entry arrays. Region pixels outside the
 * surface are skipped; an empty region yields all-zero bins.
 *
 * Allocates the result arrays; this is an analysis query, not a hot-path pass.
 */
export function getSurfaceHistogram(source: Readonly<SurfaceRegion>): SurfaceHistogram {
  const red = new Array<number>(256).fill(0);
  const green = new Array<number>(256).fill(0);
  const blue = new Array<number>(256).fill(0);
  const alpha = new Array<number>(256).fill(0);
  const data = source.surface.data;
  const surfaceWidth = source.surface.width;
  for (let py = 0; py < source.height; py++) {
    const y = source.y + py;
    if (y < 0 || y >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const x = source.x + px;
      if (x < 0 || x >= surfaceWidth) continue;
      const i = (y * surfaceWidth + x) * 4;
      red[data[i]]++;
      green[data[i + 1]]++;
      blue[data[i + 2]]++;
      alpha[data[i + 3]]++;
    }
  }
  return { alpha, blue, green, red };
}

function buildEqualizeMap(bins: number[], total: number): number[] {
  const map = new Array<number>(256);
  let cdf = 0;
  let cdfMin = -1;
  for (let i = 0; i < 256; i++) {
    cdf += bins[i];
    if (bins[i] > 0 && cdfMin === -1) cdfMin = cdf;
    map[i] = total === cdfMin ? i : Math.round(((cdf - cdfMin) / (total - cdfMin)) * 255);
  }
  return map;
}
