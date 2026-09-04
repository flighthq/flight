import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bitmap, BitmapRegion } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { invalidateBitmap } from './bitmap';

/**
 * Merges four single-channel bitmaps (or any full-RGBA bitmaps) into `out`
 * by taking one channel from each input bitmap:
 * - `out.R` ← `r.R` (red channel of the red-source bitmap)
 * - `out.G` ← `g.G`
 * - `out.B` ← `b.B`
 * - `out.A` ← `a.A`
 *
 * All inputs and `out` must have the same dimensions. The copied size is the
 * minimum overlap of all five bitmaps. Pixels outside any bitmap are skipped.
 */
export function mergeBitmapChannels(
  out: Readonly<BitmapRegion>,
  r: Readonly<BitmapRegion>,
  g: Readonly<BitmapRegion>,
  b: Readonly<BitmapRegion>,
  a: Readonly<BitmapRegion>,
): void {
  const w = Math.min(out.width, r.width, g.width, b.width, a.width);
  const h = Math.min(out.height, r.height, g.height, b.height, a.height);
  const od = out.bitmap.data;
  const rd = r.bitmap.data;
  const gd = g.bitmap.data;
  const bd = b.bitmap.data;
  const ad = a.bitmap.data;
  for (let py = 0; py < h; py++) {
    const oy = out.y + py;
    const ry = r.y + py;
    const gy = g.y + py;
    const by = b.y + py;
    const ay = a.y + py;
    if (
      oy < 0 ||
      oy >= out.bitmap.height ||
      ry < 0 ||
      ry >= r.bitmap.height ||
      gy < 0 ||
      gy >= g.bitmap.height ||
      by < 0 ||
      by >= b.bitmap.height ||
      ay < 0 ||
      ay >= a.bitmap.height
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
        ox >= out.bitmap.width ||
        rx < 0 ||
        rx >= r.bitmap.width ||
        gx < 0 ||
        gx >= g.bitmap.width ||
        bx < 0 ||
        bx >= b.bitmap.width ||
        ax < 0 ||
        ax >= a.bitmap.width
      )
        continue;
      const di = (oy * out.bitmap.width + ox) * 4;
      od[di] = rd[(ry * r.bitmap.width + rx) * 4];
      od[di + 1] = gd[(gy * g.bitmap.width + gx) * 4 + 1];
      od[di + 2] = bd[(by * b.bitmap.width + bx) * 4 + 2];
      od[di + 3] = ad[(ay * a.bitmap.width + ax) * 4 + 3];
    }
  }
  invalidateBitmap(out.bitmap);
}

/**
 * Splits `source` into four single-channel grayscale bitmaps (R, G, B, A).
 * Each output bitmap is the same dimensions as `source`; each pixel's value
 * is taken from the corresponding channel of the source pixel and written to
 * the R, G, B, and A channels of the output (i.e. a red value of 0xAA produces
 * 0xAAAAAAAA in the R bitmap).
 *
 * Returns an array of four bitmaps in RGBA order: `[r, g, b, a]`.
 */
export function splitBitmapChannels(source: Readonly<Bitmap>): [Bitmap, Bitmap, Bitmap, Bitmap] {
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
    makeBitmap(rData, w, h, source),
    makeBitmap(gData, w, h, source),
    makeBitmap(bData, w, h, source),
    makeBitmap(aData, w, h, source),
  ];
}

function makeBitmap(
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  source: Readonly<Bitmap>,
): Bitmap {
  const out = allocateEntity<unknown>();
  out.alphaType = source.alphaType;
  out.gamut = source.gamut;
  out.data = data;
  out.format = source.format;
  out.height = height;
  out.kind = BitmapTextureSourceKind;
  out.version = 0;
  out.width = width;
  return finishEntity(out);
}
