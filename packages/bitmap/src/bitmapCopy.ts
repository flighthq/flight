import type { BitmapRegion } from '@flighthq/types/contract';

import { invalidateBitmap } from './bitmap';
import type { ImageChannel } from './bitmapImageChannel';

/**
 * Copies one channel of `source` into a channel of `dest`. The copied size is
 * the overlap of the two regions; pixels outside either bitmap are skipped.
 *
 * Safe to pass the same bitmap in `dest` and `source` as long as `destChannel`
 * and `sourceChannel` differ (each pixel writes a different byte than it reads).
 * Copying a channel to itself is always a no-op regardless of aliasing.
 */
export function copyBitmapChannel(
  dest: Readonly<BitmapRegion>,
  destChannel: ImageChannel,
  source: Readonly<BitmapRegion>,
  sourceChannel: ImageChannel,
): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.bitmap.height || dy < 0 || dy >= dest.bitmap.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      const dx = dest.x + px;
      if (sx < 0 || sx >= source.bitmap.width || dx < 0 || dx >= dest.bitmap.width) continue;
      const si = (sy * source.bitmap.width + sx) * 4;
      const di = (dy * dest.bitmap.width + dx) * 4;
      dest.bitmap.data[di + destChannel] = source.bitmap.data[si + sourceChannel];
    }
  }
  invalidateBitmap(dest.bitmap);
}

/**
 * Copies `source` into `dest`. The copied size is the overlap of the two
 * regions; pixels outside either bitmap are skipped. When `composite` is
 * true, `source` is alpha-composited (Porter-Duff source-over) over `dest`
 * instead of overwriting it.
 *
 * Safe to pass the same bitmap in `dest` and `source` when the regions do not
 * overlap. Overlapping regions produce undefined results because pixels are
 * written before all source reads are complete.
 */
export function copyBitmapPixels(
  dest: Readonly<BitmapRegion>,
  source: Readonly<BitmapRegion>,
  composite: boolean = false,
): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  const sd = source.bitmap.data;
  const dd = dest.bitmap.data;
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.bitmap.height || dy < 0 || dy >= dest.bitmap.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      const dx = dest.x + px;
      if (sx < 0 || sx >= source.bitmap.width || dx < 0 || dx >= dest.bitmap.width) continue;
      const si = (sy * source.bitmap.width + sx) * 4;
      const di = (dy * dest.bitmap.width + dx) * 4;
      if (composite) {
        const srcA = sd[si + 3] / 255;
        const dstA = dd[di + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA > 0) {
          dd[di] = Math.round((sd[si] * srcA + dd[di] * dstA * (1 - srcA)) / outA);
          dd[di + 1] = Math.round((sd[si + 1] * srcA + dd[di + 1] * dstA * (1 - srcA)) / outA);
          dd[di + 2] = Math.round((sd[si + 2] * srcA + dd[di + 2] * dstA * (1 - srcA)) / outA);
          dd[di + 3] = Math.round(outA * 255);
        }
      } else {
        dd[di] = sd[si];
        dd[di + 1] = sd[si + 1];
        dd[di + 2] = sd[si + 2];
        dd[di + 3] = sd[si + 3];
      }
    }
  }
  invalidateBitmap(dest.bitmap);
}
