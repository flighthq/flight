import type { ColorBoundsRectangle, SurfaceRegion } from '@flighthq/types';

/**
 * Scans the `source` region for pixels matching `color` under `mask`
 * (`findColor` true) or not matching it (false), and returns the tightest
 * bounding rectangle of those pixels in surface-absolute coordinates, or `null`
 * if none match. Region pixels outside the surface are skipped.
 */
export function getSurfaceColorBoundsRectangle(
  source: Readonly<SurfaceRegion>,
  mask: number,
  color: number,
  findColor: boolean = true,
): ColorBoundsRectangle | null {
  const data = source.surface.data;
  const surfaceWidth = source.surface.width;
  const maskedColor = (color >>> 0) & (mask >>> 0);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let py = 0; py < source.height; py++) {
    const y = source.y + py;
    if (y < 0 || y >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const x = source.x + px;
      if (x < 0 || x >= surfaceWidth) continue;
      const i = (y * surfaceWidth + x) * 4;
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
