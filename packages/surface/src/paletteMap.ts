import { invalidateImageSource } from '@flighthq/assets';
import type { SurfaceRegion } from '@flighthq/types';

/**
 * Remaps each color channel of `source` independently through a 256-entry
 * lookup table, writing into `dest`. Each table is indexed by the 0..255 input
 * channel value and supplies the 0..255 output value; a `null` table leaves
 * that channel unchanged. The remapped size is the overlap of the two regions.
 *
 * This is the building block for levels, curves, gamma, posterize, and
 * per-channel inversion. Unlike Flash's 32-bit-summing `paletteMap`, the
 * channels are mapped independently, which is what level/curve adjustments
 * need; build a table once and reuse it across frames.
 *
 * Safe to pass the same surface and region in `dest` and `source` — each
 * pixel's channels are read before any channel of that pixel is written.
 */
export function applySurfacePaletteMap(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  redMap: ReadonlyArray<number> | null,
  greenMap: ReadonlyArray<number> | null,
  blueMap: ReadonlyArray<number> | null,
  alphaMap: ReadonlyArray<number> | null,
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
      const r = sd[si];
      const g = sd[si + 1];
      const b = sd[si + 2];
      const a = sd[si + 3];
      dd[di] = redMap ? redMap[r] : r;
      dd[di + 1] = greenMap ? greenMap[g] : g;
      dd[di + 2] = blueMap ? blueMap[b] : b;
      dd[di + 3] = alphaMap ? alphaMap[a] : a;
    }
  }
  invalidateImageSource(dest.surface);
}
