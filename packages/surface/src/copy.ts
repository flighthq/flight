import type { SurfaceRegion } from '@flighthq/types';

import type { ImageChannel } from './imageChannel';

/**
 * Copies one channel of `source` into a channel of `dest`. The copied size is
 * the overlap of the two regions; pixels outside either surface are skipped.
 *
 * Safe to pass the same surface in `dest` and `source` as long as `destChannel`
 * and `sourceChannel` differ (each pixel writes a different byte than it reads).
 * Copying a channel to itself is always a no-op regardless of aliasing.
 */
export function copySurfaceChannel(
  dest: Readonly<SurfaceRegion>,
  destChannel: ImageChannel,
  source: Readonly<SurfaceRegion>,
  sourceChannel: ImageChannel,
): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.surface.height || dy < 0 || dy >= dest.surface.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      const dx = dest.x + px;
      if (sx < 0 || sx >= source.surface.width || dx < 0 || dx >= dest.surface.width) continue;
      const si = (sy * source.surface.width + sx) * 4;
      const di = (dy * dest.surface.width + dx) * 4;
      dest.surface.data[di + destChannel] = source.surface.data[si + sourceChannel];
    }
  }
}

/**
 * Copies `source` into `dest`. The copied size is the overlap of the two
 * regions; pixels outside either surface are skipped. When `mergeAlpha` is
 * true, `source` is alpha-composited over `dest` instead of overwriting it.
 *
 * Safe to pass the same surface in `dest` and `source` when the regions do not
 * overlap. Overlapping regions produce undefined results because pixels are
 * written before all source reads are complete.
 */
export function copySurfacePixels(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  mergeAlpha: boolean = false,
): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  const sd = source.surface.data;
  const dd = dest.surface.data;
  for (let py = 0; py < h; py++) {
    const sy = source.y + py;
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.surface.height || dy < 0 || dy >= dest.surface.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + px;
      const dx = dest.x + px;
      if (sx < 0 || sx >= source.surface.width || dx < 0 || dx >= dest.surface.width) continue;
      const si = (sy * source.surface.width + sx) * 4;
      const di = (dy * dest.surface.width + dx) * 4;
      if (mergeAlpha) {
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
}
