import type { BitmapHistogram, BitmapRegion } from '@flighthq/types/contract';

import { invalidateBitmap } from './bitmap';
import { applyBitmapPaletteMap } from './bitmapPaletteMap';

/**
 * Applies histogram equalization to `source`, writing into `dest`. Each RGB
 * channel is equalized independently using its cumulative distribution function,
 * spreading the tonal range across the full 0..255 output. The alpha channel is
 * copied unchanged.
 *
 * Safe to pass the same bitmap and region in `dest` and `source` for in-place
 * equalization (the palette map reads each pixel before writing it).
 */
export function equalizeBitmapHistogram(dest: Readonly<BitmapRegion>, source: Readonly<BitmapRegion>): void {
  const histogram = getBitmapHistogram(source);
  const total = source.width * source.height;

  applyBitmapPaletteMap(
    dest,
    source,
    buildEqualizeMap(histogram.red, total),
    buildEqualizeMap(histogram.green, total),
    buildEqualizeMap(histogram.blue, total),
    null,
  );
  invalidateBitmap(dest.bitmap);
}

/**
 * Counts how many pixels in the `source` region fall into each 0..255 value,
 * per channel, and returns four 256-entry arrays. Region pixels outside the
 * bitmap are skipped; an empty region yields all-zero bins.
 *
 * Allocates the result arrays; this is an analysis query, not a hot-path pass.
 */
export function getBitmapHistogram(source: Readonly<BitmapRegion>): BitmapHistogram {
  const red = new Array<number>(256).fill(0);
  const green = new Array<number>(256).fill(0);
  const blue = new Array<number>(256).fill(0);
  const alpha = new Array<number>(256).fill(0);
  const data = source.bitmap.data;
  const bitmapWidth = source.bitmap.width;
  for (let py = 0; py < source.height; py++) {
    const y = source.y + py;
    if (y < 0 || y >= source.bitmap.height) continue;
    for (let px = 0; px < source.width; px++) {
      const x = source.x + px;
      if (x < 0 || x >= bitmapWidth) continue;
      const i = (y * bitmapWidth + x) * 4;
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
