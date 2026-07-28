import type { BitmapRegion } from '@flighthq/types/contract';

import { invalidateBitmap } from './bitmap';

/**
 * Mirrors the `source` region left-to-right into the `dest` region. The mirror
 * size is the overlap of the two regions. Safe to pass the same bitmap and
 * region in `dest` and `source` for an in-place flip — when aliased, columns
 * are swapped in pairs; otherwise `dest` and `source` must not overlap.
 */
export function flipBitmapHorizontal(dest: Readonly<BitmapRegion>, source: Readonly<BitmapRegion>): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  const data = dest.bitmap.data;
  const stride = dest.bitmap.width;
  if (isSameRegion(dest, source)) {
    const half = w >> 1;
    for (let py = 0; py < h; py++) {
      const y = dest.y + py;
      if (y < 0 || y >= dest.bitmap.height) continue;
      for (let px = 0; px < half; px++) {
        const xa = dest.x + px;
        const xb = dest.x + (w - 1 - px);
        if (xa < 0 || xa >= stride || xb < 0 || xb >= stride) continue;
        swapPixels(data, (y * stride + xa) * 4, (y * stride + xb) * 4);
      }
    }
    return;
  }
  copyMirrored(dest, source, w, h, true, false);
  invalidateBitmap(dest.bitmap);
}

/**
 * Mirrors the `source` region top-to-bottom into the `dest` region. The mirror
 * size is the overlap of the two regions. Safe to pass the same bitmap and
 * region in `dest` and `source` for an in-place flip — when aliased, rows are
 * swapped in pairs; otherwise `dest` and `source` must not overlap.
 */
export function flipBitmapVertical(dest: Readonly<BitmapRegion>, source: Readonly<BitmapRegion>): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  const data = dest.bitmap.data;
  const stride = dest.bitmap.width;
  if (isSameRegion(dest, source)) {
    const half = h >> 1;
    for (let py = 0; py < half; py++) {
      const yTop = dest.y + py;
      const yBottom = dest.y + (h - 1 - py);
      if (yTop < 0 || yTop >= dest.bitmap.height || yBottom < 0 || yBottom >= dest.bitmap.height) continue;
      for (let px = 0; px < w; px++) {
        const x = dest.x + px;
        if (x < 0 || x >= stride) continue;
        swapPixels(data, (yTop * stride + x) * 4, (yBottom * stride + x) * 4);
      }
    }
    return;
  }
  copyMirrored(dest, source, w, h, false, true);
  invalidateBitmap(dest.bitmap);
}

// Copies source -> dest with optional per-axis mirroring. Used for the
// non-aliased flip path (distinct bitmaps or non-overlapping regions).
function copyMirrored(
  dest: Readonly<BitmapRegion>,
  source: Readonly<BitmapRegion>,
  w: number,
  h: number,
  mirrorX: boolean,
  mirrorY: boolean,
): void {
  const sd = source.bitmap.data;
  const dd = dest.bitmap.data;
  const sStride = source.bitmap.width;
  const dStride = dest.bitmap.width;
  for (let py = 0; py < h; py++) {
    const sy = source.y + (mirrorY ? h - 1 - py : py);
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.bitmap.height || dy < 0 || dy >= dest.bitmap.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + (mirrorX ? w - 1 - px : px);
      const dx = dest.x + px;
      if (sx < 0 || sx >= sStride || dx < 0 || dx >= dStride) continue;
      const si = (sy * sStride + sx) * 4;
      const di = (dy * dStride + dx) * 4;
      dd[di] = sd[si];
      dd[di + 1] = sd[si + 1];
      dd[di + 2] = sd[si + 2];
      dd[di + 3] = sd[si + 3];
    }
  }
}

function isSameRegion(a: Readonly<BitmapRegion>, b: Readonly<BitmapRegion>): boolean {
  return a.bitmap === b.bitmap && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function swapPixels(data: Uint8ClampedArray, a: number, b: number): void {
  for (let c = 0; c < 4; c++) {
    const t = data[a + c];
    data[a + c] = data[b + c];
    data[b + c] = t;
  }
}
