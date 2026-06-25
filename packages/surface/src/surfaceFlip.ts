import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceRegion } from '@flighthq/types';

/**
 * Mirrors the `source` region left-to-right into the `dest` region. The mirror
 * size is the overlap of the two regions. Safe to pass the same surface and
 * region in `dest` and `source` for an in-place flip — when aliased, columns
 * are swapped in pairs; otherwise `dest` and `source` must not overlap.
 */
export function flipSurfaceHorizontal(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  const data = dest.surface.data;
  const stride = dest.surface.width;
  if (isSameRegion(dest, source)) {
    const half = w >> 1;
    for (let py = 0; py < h; py++) {
      const y = dest.y + py;
      if (y < 0 || y >= dest.surface.height) continue;
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
  invalidateImageResource(dest.surface);
}

/**
 * Mirrors the `source` region top-to-bottom into the `dest` region. The mirror
 * size is the overlap of the two regions. Safe to pass the same surface and
 * region in `dest` and `source` for an in-place flip — when aliased, rows are
 * swapped in pairs; otherwise `dest` and `source` must not overlap.
 */
export function flipSurfaceVertical(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  const w = Math.min(dest.width, source.width);
  const h = Math.min(dest.height, source.height);
  const data = dest.surface.data;
  const stride = dest.surface.width;
  if (isSameRegion(dest, source)) {
    const half = h >> 1;
    for (let py = 0; py < half; py++) {
      const yTop = dest.y + py;
      const yBottom = dest.y + (h - 1 - py);
      if (yTop < 0 || yTop >= dest.surface.height || yBottom < 0 || yBottom >= dest.surface.height) continue;
      for (let px = 0; px < w; px++) {
        const x = dest.x + px;
        if (x < 0 || x >= stride) continue;
        swapPixels(data, (yTop * stride + x) * 4, (yBottom * stride + x) * 4);
      }
    }
    return;
  }
  copyMirrored(dest, source, w, h, false, true);
  invalidateImageResource(dest.surface);
}

// Copies source -> dest with optional per-axis mirroring. Used for the
// non-aliased flip path (distinct surfaces or non-overlapping regions).
function copyMirrored(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  w: number,
  h: number,
  mirrorX: boolean,
  mirrorY: boolean,
): void {
  const sd = source.surface.data;
  const dd = dest.surface.data;
  const sStride = source.surface.width;
  const dStride = dest.surface.width;
  for (let py = 0; py < h; py++) {
    const sy = source.y + (mirrorY ? h - 1 - py : py);
    const dy = dest.y + py;
    if (sy < 0 || sy >= source.surface.height || dy < 0 || dy >= dest.surface.height) continue;
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
