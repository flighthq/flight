import { createEntity } from '@flighthq/entity';
import { invalidateImageResource } from '@flighthq/image';
import type { Surface, SurfaceRegion } from '@flighthq/types';

/**
 * Merges four single-channel surfaces (or any full-RGBA surfaces) into `out`
 * by taking one channel from each input surface:
 * - `out.R` ← `r.R` (red channel of the red-source surface)
 * - `out.G` ← `g.G`
 * - `out.B` ← `b.B`
 * - `out.A` ← `a.A`
 *
 * All inputs and `out` must have the same dimensions. The copied size is the
 * minimum overlap of all five surfaces. Pixels outside any surface are skipped.
 */
export function mergeSurfaceChannels(
  out: Readonly<SurfaceRegion>,
  r: Readonly<SurfaceRegion>,
  g: Readonly<SurfaceRegion>,
  b: Readonly<SurfaceRegion>,
  a: Readonly<SurfaceRegion>,
): void {
  const w = Math.min(out.width, r.width, g.width, b.width, a.width);
  const h = Math.min(out.height, r.height, g.height, b.height, a.height);
  const od = out.surface.data;
  const rd = r.surface.data;
  const gd = g.surface.data;
  const bd = b.surface.data;
  const ad = a.surface.data;
  for (let py = 0; py < h; py++) {
    const oy = out.y + py;
    const ry = r.y + py;
    const gy = g.y + py;
    const by = b.y + py;
    const ay = a.y + py;
    if (
      oy < 0 ||
      oy >= out.surface.height ||
      ry < 0 ||
      ry >= r.surface.height ||
      gy < 0 ||
      gy >= g.surface.height ||
      by < 0 ||
      by >= b.surface.height ||
      ay < 0 ||
      ay >= a.surface.height
    )
      continue;
    for (let px = 0; px < w; px++) {
      const ox = out.x + px;
      const rx = r.x + px;
      const gx = g.x + px;
      const bx = b.x + px;
      const ax = a.x + px;
      if (
        ox < 0 ||
        ox >= out.surface.width ||
        rx < 0 ||
        rx >= r.surface.width ||
        gx < 0 ||
        gx >= g.surface.width ||
        bx < 0 ||
        bx >= b.surface.width ||
        ax < 0 ||
        ax >= a.surface.width
      )
        continue;
      const di = (oy * out.surface.width + ox) * 4;
      od[di] = rd[(ry * r.surface.width + rx) * 4];
      od[di + 1] = gd[(gy * g.surface.width + gx) * 4 + 1];
      od[di + 2] = bd[(by * b.surface.width + bx) * 4 + 2];
      od[di + 3] = ad[(ay * a.surface.width + ax) * 4 + 3];
    }
  }
  invalidateImageResource(out.surface);
}

/**
 * Splits `source` into four single-channel grayscale surfaces (R, G, B, A).
 * Each output surface is the same dimensions as `source`; each pixel's value
 * is taken from the corresponding channel of the source pixel and written to
 * the R, G, B, and A channels of the output (i.e. a red value of 0xAA produces
 * 0xAAAAAAAA in the R surface).
 *
 * Returns an array of four surfaces in RGBA order: `[r, g, b, a]`.
 */
export function splitSurfaceChannels(source: Readonly<Surface>): [Surface, Surface, Surface, Surface] {
  const w = source.width;
  const h = source.height;
  const sd = source.data;
  const rData = new Uint8ClampedArray(w * h * 4);
  const gData = new Uint8ClampedArray(w * h * 4);
  const bData = new Uint8ClampedArray(w * h * 4);
  const aData = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const si = i * 4;
    const r = sd[si];
    const g = sd[si + 1];
    const b = sd[si + 2];
    const a = sd[si + 3];
    rData[si] = r;
    rData[si + 1] = r;
    rData[si + 2] = r;
    rData[si + 3] = 0xff;
    gData[si] = g;
    gData[si + 1] = g;
    gData[si + 2] = g;
    gData[si + 3] = 0xff;
    bData[si] = b;
    bData[si + 1] = b;
    bData[si + 2] = b;
    bData[si + 3] = 0xff;
    aData[si] = a;
    aData[si + 1] = a;
    aData[si + 2] = a;
    // Store the alpha value in the A channel position so round-trip
    // split → merge restores the original alpha.
    aData[si + 3] = a;
  }
  return [
    makeSurface(rData, w, h, source),
    makeSurface(gData, w, h, source),
    makeSurface(bData, w, h, source),
    makeSurface(aData, w, h, source),
  ];
}

function makeSurface(
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  source: Readonly<Surface>,
): Surface {
  return createEntity({
    alphaType: source.alphaType,
    colorSpace: source.colorSpace,
    compressed: null,
    data,
    format: source.format,
    height,
    source: null,
    version: 0,
    width,
  });
}
