import type { BitmapEdgeMode, BitmapRegion, BitmapResizeMode } from '@flighthq/types/contract';

import { invalidateBitmap } from './bitmap';
import { transformBitmap } from './bitmapAffine';

/**
 * Rotates the `source` region by `angle` radians into the `dest` region, around
 * a pivot point in source coordinates. `pivotX` and `pivotY` default to the
 * source region centre. `edgeMode` controls out-of-bounds source positions
 * (default `'clamp'`). `sampleMode` controls interpolation quality (default
 * `'bilinear'`).
 *
 * `dest` must not alias `source`.
 */
export function rotateBitmap(
  dest: Readonly<BitmapRegion>,
  source: Readonly<BitmapRegion>,
  angle: number,
  pivotX: number = (source.width - 1) / 2,
  pivotY: number = (source.height - 1) / 2,
  edgeMode: BitmapEdgeMode = 'clamp',
  sampleMode: BitmapResizeMode = 'bilinear',
): void {
  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);
  const destPivotX = (dest.width - 1) / 2;
  const destPivotY = (dest.height - 1) / 2;
  const e = pivotX - cosA * destPivotX + sinA * destPivotY;
  const f = pivotY - sinA * destPivotX - cosA * destPivotY;
  transformBitmap(dest, source, [cosA, sinA, -sinA, cosA, e, f], edgeMode, sampleMode);
}

/**
 * Rotates the `source` region 180° into the `dest` region. `dest` and `source`
 * must have the same dimensions. Safe to pass the same bitmap and region in
 * `dest` and `source` for an in-place rotation — when aliased, opposite pixels
 * are swapped in pairs; otherwise the regions must not overlap.
 */
export function rotateBitmap180(dest: Readonly<BitmapRegion>, source: Readonly<BitmapRegion>): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  if (isSameRegion(dest, source)) {
    const data = dest.bitmap.data;
    const stride = dest.bitmap.width;
    const total = w * h;
    const half = total >> 1;
    for (let k = 0; k < half; k++) {
      const ax = dest.x + (k % w);
      const ay = dest.y + Math.floor(k / w);
      const bx = dest.x + (w - 1 - (k % w));
      const by = dest.y + (h - 1 - Math.floor(k / w));
      if (!inBounds(ax, ay, stride, dest.bitmap.height) || !inBounds(bx, by, stride, dest.bitmap.height)) continue;
      swapPixels(data, (ay * stride + ax) * 4, (by * stride + bx) * 4);
    }
    return;
  }
  const sd = source.bitmap.data;
  const dd = dest.bitmap.data;
  const sStride = source.bitmap.width;
  const dStride = dest.bitmap.width;
  for (let py = 0; py < h; py++) {
    const sy = source.y + (h - 1 - py);
    const dy = dest.y + py;
    if (!inBounds(0, sy, sStride, source.bitmap.height) || !inBounds(0, dy, dStride, dest.bitmap.height)) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + (w - 1 - px);
      const dx = dest.x + px;
      if (sx < 0 || sx >= sStride || dx < 0 || dx >= dStride) continue;
      copyPixel(dd, (dy * dStride + dx) * 4, sd, (sy * sStride + sx) * 4);
    }
  }
  invalidateBitmap(dest.bitmap);
}

/**
 * Rotates the `source` region 90° clockwise into the `dest` region. `dest`'s
 * dimensions must be swapped relative to `source` (`dest.width === source.height`,
 * `dest.height === source.width`). `dest` must not alias `source`.
 */
export function rotateBitmapClockwise(dest: Readonly<BitmapRegion>, source: Readonly<BitmapRegion>): void {
  const sw = source.width;
  const sh = source.height;
  const sd = source.bitmap.data;
  const dd = dest.bitmap.data;
  const sStride = source.bitmap.width;
  const dStride = dest.bitmap.width;
  for (let py = 0; py < sh; py++) {
    const sy = source.y + py;
    if (sy < 0 || sy >= source.bitmap.height) continue;
    for (let px = 0; px < sw; px++) {
      const sx = source.x + px;
      if (sx < 0 || sx >= sStride) continue;
      const dx = dest.x + (sh - 1 - py);
      const dy = dest.y + px;
      if (dx < 0 || dx >= dStride || dy < 0 || dy >= dest.bitmap.height) continue;
      copyPixel(dd, (dy * dStride + dx) * 4, sd, (sy * sStride + sx) * 4);
    }
  }
  invalidateBitmap(dest.bitmap);
}

/**
 * Rotates the `source` region 90° counter-clockwise into the `dest` region.
 * `dest`'s dimensions must be swapped relative to `source`
 * (`dest.width === source.height`, `dest.height === source.width`). `dest` must
 * not alias `source`.
 */
export function rotateBitmapCounterClockwise(dest: Readonly<BitmapRegion>, source: Readonly<BitmapRegion>): void {
  const sw = source.width;
  const sh = source.height;
  const sd = source.bitmap.data;
  const dd = dest.bitmap.data;
  const sStride = source.bitmap.width;
  const dStride = dest.bitmap.width;
  for (let py = 0; py < sh; py++) {
    const sy = source.y + py;
    if (sy < 0 || sy >= source.bitmap.height) continue;
    for (let px = 0; px < sw; px++) {
      const sx = source.x + px;
      if (sx < 0 || sx >= sStride) continue;
      const dx = dest.x + py;
      const dy = dest.y + (sw - 1 - px);
      if (dx < 0 || dx >= dStride || dy < 0 || dy >= dest.bitmap.height) continue;
      copyPixel(dd, (dy * dStride + dx) * 4, sd, (sy * sStride + sx) * 4);
    }
  }
  invalidateBitmap(dest.bitmap);
}

function copyPixel(dest: Uint8ClampedArray, di: number, source: Readonly<Uint8ClampedArray>, si: number): void {
  dest[di] = source[si];
  dest[di + 1] = source[si + 1];
  dest[di + 2] = source[si + 2];
  dest[di + 3] = source[si + 3];
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
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
