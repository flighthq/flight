import { invalidateImageResource } from '@flighthq/image/contract';
import type { BitmapRegion } from '@flighthq/types/contract';

/**
 * Copies only the alpha channel from the `source` region into the `dest`
 * region. RGB channels of `dest` are left unchanged. The copied size is the
 * overlap of the two regions.
 *
 * Safe to pass the same bitmap and region in `dest` and `source` (no-op on
 * alpha since each value is read and immediately written to the same location).
 */
export function copyBitmapAlpha(dest: Readonly<BitmapRegion>, source: Readonly<BitmapRegion>): void {
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
      // Read alpha before writing — safe for the aliased case.
      const alpha = sd[si + 3];
      dd[di + 3] = alpha;
    }
  }
  invalidateImageResource(dest.bitmap);
}

/**
 * Scales every alpha value in the `out` region by `factor` (0–1). RGB channels
 * are unchanged. A `factor` of 0 makes the region fully transparent; a `factor`
 * of 1 leaves it unchanged; values in between fade it proportionally.
 *
 * `factor` is clamped to [0, 1].
 */
export function multiplyBitmapAlpha(out: Readonly<BitmapRegion>, factor: number): void {
  const f = Math.max(0, Math.min(1, factor));
  const data = out.bitmap.data;
  const bitmapWidth = out.bitmap.width;
  for (let py = 0; py < out.height; py++) {
    const y = out.y + py;
    if (y < 0 || y >= out.bitmap.height) continue;
    for (let px = 0; px < out.width; px++) {
      const x = out.x + px;
      if (x < 0 || x >= bitmapWidth) continue;
      const i = (y * bitmapWidth + x) * 4 + 3;
      data[i] = Math.round(data[i] * f);
    }
  }
  invalidateImageResource(out.bitmap);
}

/**
 * Writes a constant `alpha` value (0–255) to every pixel in the `out` region.
 * RGB channels are unchanged. Useful for making a region fully opaque or
 * transparent in a single call.
 *
 * `alpha` is clamped to [0, 255].
 */
export function setBitmapAlpha(out: Readonly<BitmapRegion>, alpha: number): void {
  const a = Math.max(0, Math.min(255, Math.round(alpha)));
  const data = out.bitmap.data;
  const bitmapWidth = out.bitmap.width;
  for (let py = 0; py < out.height; py++) {
    const y = out.y + py;
    if (y < 0 || y >= out.bitmap.height) continue;
    for (let px = 0; px < out.width; px++) {
      const x = out.x + px;
      if (x < 0 || x >= bitmapWidth) continue;
      data[(y * bitmapWidth + x) * 4 + 3] = a;
    }
  }
  invalidateImageResource(out.bitmap);
}
