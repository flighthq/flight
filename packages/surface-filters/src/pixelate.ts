import type { SurfaceRegion } from '@flighthq/types';

/**
 * Pixelates (mosaics) `source` into `out`: the region is divided into
 * `blockSize × blockSize` cells, each cell is averaged, and every output pixel
 * in the cell takes that average color. `blockSize` is clamped to at least 1
 * (a no-op copy at 1). Edge cells are clipped to the region.
 *
 * `out` must be at least `source.width * source.height * 4` bytes. Safe to pass
 * `source.surface.data` as `out` for a full-surface region — each cell is fully
 * read before it is written, and cells do not overlap.
 */
export function applySurfacePixelateFilter(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  blockSize: number,
): void {
  const block = Math.max(1, Math.round(blockSize));
  const w = source.width;
  const h = source.height;
  const surfaceWidth = source.surface.width;
  const surfaceHeight = source.surface.height;
  const data = source.surface.data;

  for (let by = 0; by < h; by += block) {
    const yEnd = Math.min(by + block, h);
    for (let bx = 0; bx < w; bx += block) {
      const xEnd = Math.min(bx + block, w);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let py = by; py < yEnd; py++) {
        const sy = source.y + py;
        if (sy < 0 || sy >= surfaceHeight) continue;
        for (let px = bx; px < xEnd; px++) {
          const sx = source.x + px;
          if (sx < 0 || sx >= surfaceWidth) continue;
          const si = (sy * surfaceWidth + sx) * 4;
          r += data[si];
          g += data[si + 1];
          b += data[si + 2];
          a += data[si + 3];
          count++;
        }
      }
      if (count === 0) continue;
      const ar = Math.round(r / count);
      const ag = Math.round(g / count);
      const ab = Math.round(b / count);
      const aa = Math.round(a / count);
      for (let py = by; py < yEnd; py++) {
        for (let px = bx; px < xEnd; px++) {
          const di = (py * w + px) * 4;
          out[di] = ar;
          out[di + 1] = ag;
          out[di + 2] = ab;
          out[di + 3] = aa;
        }
      }
    }
  }
}
