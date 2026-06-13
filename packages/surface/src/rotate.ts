import type { SurfaceRegion } from '@flighthq/types';

/**
 * Rotates the `source` region by `angle` radians into the `dest` region, around
 * a pivot point in source coordinates. `pivotX` and `pivotY` default to the
 * source region centre. Uses bilinear sampling; out-of-bounds source positions
 * are written as transparent black.
 *
 * `dest` must not alias `source`.
 */
export function rotateSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  angle: number,
  pivotX: number = (source.width - 1) / 2,
  pivotY: number = (source.height - 1) / 2,
): void {
  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);
  const sw = source.width;
  const sh = source.height;
  const dw = dest.width;
  const dh = dest.height;
  const sd = source.surface.data;
  const dd = dest.surface.data;
  const sStride = source.surface.width;
  const dStride = dest.surface.width;
  const destPivotX = (dw - 1) / 2;
  const destPivotY = (dh - 1) / 2;

  for (let dy = 0; dy < dh; dy++) {
    const oy = dest.y + dy;
    if (oy < 0 || oy >= dest.surface.height) continue;
    const ry = dy - destPivotY;
    for (let dx = 0; dx < dw; dx++) {
      const ox = dest.x + dx;
      if (ox < 0 || ox >= dStride) continue;
      const rx = dx - destPivotX;
      const sx = cosA * rx - sinA * ry + pivotX;
      const sy = sinA * rx + cosA * ry + pivotY;
      const di = (oy * dStride + ox) * 4;

      if (sx < -0.5 || sx > sw - 0.5 || sy < -0.5 || sy > sh - 0.5) {
        dd[di] = 0;
        dd[di + 1] = 0;
        dd[di + 2] = 0;
        dd[di + 3] = 0;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const tx = sx - x0;
      const ty = sy - y0;
      const x0c = source.x + Math.max(0, Math.min(sw - 1, x0));
      const x1c = source.x + Math.max(0, Math.min(sw - 1, x0 + 1));
      const y0c = source.y + Math.max(0, Math.min(sh - 1, y0));
      const y1c = source.y + Math.max(0, Math.min(sh - 1, y0 + 1));
      const i00 = (y0c * sStride + x0c) * 4;
      const i10 = (y0c * sStride + x1c) * 4;
      const i01 = (y1c * sStride + x0c) * 4;
      const i11 = (y1c * sStride + x1c) * 4;
      for (let c = 0; c < 4; c++) {
        const top = sd[i00 + c] * (1 - tx) + sd[i10 + c] * tx;
        const bottom = sd[i01 + c] * (1 - tx) + sd[i11 + c] * tx;
        dd[di + c] = Math.round(top * (1 - ty) + bottom * ty);
      }
    }
  }
}

/**
 * Rotates the `source` region 180° into the `dest` region. `dest` and `source`
 * must have the same dimensions. Safe to pass the same surface and region in
 * `dest` and `source` for an in-place rotation — when aliased, opposite pixels
 * are swapped in pairs; otherwise the regions must not overlap.
 */
export function rotateSurface180(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  if (isSameRegion(dest, source)) {
    const data = dest.surface.data;
    const stride = dest.surface.width;
    const total = w * h;
    const half = total >> 1;
    for (let k = 0; k < half; k++) {
      const ax = dest.x + (k % w);
      const ay = dest.y + Math.floor(k / w);
      const bx = dest.x + (w - 1 - (k % w));
      const by = dest.y + (h - 1 - Math.floor(k / w));
      if (!inBounds(ax, ay, stride, dest.surface.height) || !inBounds(bx, by, stride, dest.surface.height)) continue;
      swapPixels(data, (ay * stride + ax) * 4, (by * stride + bx) * 4);
    }
    return;
  }
  const sd = source.surface.data;
  const dd = dest.surface.data;
  const sStride = source.surface.width;
  const dStride = dest.surface.width;
  for (let py = 0; py < h; py++) {
    const sy = source.y + (h - 1 - py);
    const dy = dest.y + py;
    if (!inBounds(0, sy, sStride, source.surface.height) || !inBounds(0, dy, dStride, dest.surface.height)) continue;
    for (let px = 0; px < w; px++) {
      const sx = source.x + (w - 1 - px);
      const dx = dest.x + px;
      if (sx < 0 || sx >= sStride || dx < 0 || dx >= dStride) continue;
      copyPixel(dd, (dy * dStride + dx) * 4, sd, (sy * sStride + sx) * 4);
    }
  }
}

/**
 * Rotates the `source` region 90° clockwise into the `dest` region. `dest`'s
 * dimensions must be swapped relative to `source` (`dest.width === source.height`,
 * `dest.height === source.width`). `dest` must not alias `source`.
 */
export function rotateSurfaceClockwise(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  const sw = source.width;
  const sh = source.height;
  const sd = source.surface.data;
  const dd = dest.surface.data;
  const sStride = source.surface.width;
  const dStride = dest.surface.width;
  for (let py = 0; py < sh; py++) {
    const sy = source.y + py;
    if (sy < 0 || sy >= source.surface.height) continue;
    for (let px = 0; px < sw; px++) {
      const sx = source.x + px;
      if (sx < 0 || sx >= sStride) continue;
      const dx = dest.x + (sh - 1 - py);
      const dy = dest.y + px;
      if (dx < 0 || dx >= dStride || dy < 0 || dy >= dest.surface.height) continue;
      copyPixel(dd, (dy * dStride + dx) * 4, sd, (sy * sStride + sx) * 4);
    }
  }
}

/**
 * Rotates the `source` region 90° counter-clockwise into the `dest` region.
 * `dest`'s dimensions must be swapped relative to `source`
 * (`dest.width === source.height`, `dest.height === source.width`). `dest` must
 * not alias `source`.
 */
export function rotateSurfaceCounterClockwise(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  const sw = source.width;
  const sh = source.height;
  const sd = source.surface.data;
  const dd = dest.surface.data;
  const sStride = source.surface.width;
  const dStride = dest.surface.width;
  for (let py = 0; py < sh; py++) {
    const sy = source.y + py;
    if (sy < 0 || sy >= source.surface.height) continue;
    for (let px = 0; px < sw; px++) {
      const sx = source.x + px;
      if (sx < 0 || sx >= sStride) continue;
      const dx = dest.x + py;
      const dy = dest.y + (sw - 1 - px);
      if (dx < 0 || dx >= dStride || dy < 0 || dy >= dest.surface.height) continue;
      copyPixel(dd, (dy * dStride + dx) * 4, sd, (sy * sStride + sx) * 4);
    }
  }
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

function isSameRegion(a: Readonly<SurfaceRegion>, b: Readonly<SurfaceRegion>): boolean {
  return a.surface === b.surface && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function swapPixels(data: Uint8ClampedArray, a: number, b: number): void {
  for (let c = 0; c < 4; c++) {
    const t = data[a + c];
    data[a + c] = data[b + c];
    data[b + c] = t;
  }
}
