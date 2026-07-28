import type { RectangleLike, BitmapRegion } from '@flighthq/types/contract';

/**
 * Scans the `source` region for pixels matching `color` under `mask`
 * (`findColor` true) or not matching it (false), and returns the tightest
 * bounding rectangle of those pixels in bitmap-absolute coordinates, or `null`
 * if none match. Region pixels outside the bitmap are skipped.
 *
 * The comparison is performed on the full packed 0xRRGGBBAA pixel value. To
 * match by a subset of channels, supply a `mask` that isolates the relevant
 * bytes — e.g. 0xffffff00 to ignore alpha.
 */
export function getBitmapColorBoundsRectangle(
  source: Readonly<BitmapRegion>,
  mask: number,
  color: number,
  findColor: boolean = true,
): RectangleLike | null {
  const data = source.bitmap.data;
  const bitmapWidth = source.bitmap.width;
  const maskedColor = (color >>> 0) & (mask >>> 0);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let py = 0; py < source.height; py++) {
    const y = source.y + py;
    if (y < 0 || y >= source.bitmap.height) continue;
    for (let px = 0; px < source.width; px++) {
      const x = source.x + px;
      if (x < 0 || x >= bitmapWidth) continue;
      const i = (y * bitmapWidth + x) * 4;
      const pixel = (((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0) & (mask >>> 0);
      const matches = pixel === maskedColor;
      if (matches === findColor) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX === -1) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
