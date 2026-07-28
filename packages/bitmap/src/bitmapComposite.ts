import { invalidateImageResource } from '@flighthq/image/contract';
import type { BitmapRegion } from '@flighthq/types/contract';
import { BitmapCompositeMode } from '@flighthq/types/contract';

/**
 * Alpha-composites `pixels` over `dest`. `pixels` must be at least
 * `dest.width * dest.height * 4` bytes in row-major RGBA order.
 *
 * `mode` is a BitmapCompositeMode — bitmap's single vocabulary spanning both the color-blend functions
 * (Normal (default), Multiply, Screen, Add, Subtract, Darken, Lighten, Difference, Exclusion, Overlay,
 * HardLight, SoftLight, ColorDodge, ColorBurn, Invert) and the Porter-Duff coverage operators (SourceOver,
 * DestinationOut = erase, DestinationIn = alpha mask, Copy, Clear, Xor, and the atop/in/out set). A
 * color-blend mode composites source-over; a coverage operator applies its factors with a Normal blend. An
 * unknown mode composites source-over.
 */
export function compositeBitmapPixels(
  dest: Readonly<BitmapRegion>,
  pixels: Readonly<Uint8ClampedArray>,
  mode: BitmapCompositeMode = BitmapCompositeMode.Normal,
): void {
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.bitmap.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= dest.bitmap.width) continue;
      const si = (py * dest.width + px) * 4;
      compositePixelInto(
        dest.bitmap.data,
        (y * dest.bitmap.width + x) * 4,
        pixels[si],
        pixels[si + 1],
        pixels[si + 2],
        pixels[si + 3],
        mode,
      );
    }
  }
  invalidateImageResource(dest.bitmap);
}

/**
 * Alpha-composites `source` over `dest`. See `compositeBitmapPixels` for the
 * `mode` semantics.
 */
export function compositeBitmapRegion(
  dest: Readonly<BitmapRegion>,
  source: Readonly<BitmapRegion>,
  mode: BitmapCompositeMode = BitmapCompositeMode.Normal,
): void {
  const sw = Math.min(dest.width, source.width);
  const sh = Math.min(dest.height, source.height);
  for (let py = 0; py < sh; py++) {
    const sourceY = source.y + py;
    const y = dest.y + py;
    if (sourceY < 0 || sourceY >= source.bitmap.height || y < 0 || y >= dest.bitmap.height) continue;
    for (let px = 0; px < sw; px++) {
      const sourceX = source.x + px;
      const x = dest.x + px;
      if (sourceX < 0 || sourceX >= source.bitmap.width || x < 0 || x >= dest.bitmap.width) continue;
      const si = (sourceY * source.bitmap.width + sourceX) * 4;
      compositePixelInto(
        dest.bitmap.data,
        (y * dest.bitmap.width + x) * 4,
        source.bitmap.data[si],
        source.bitmap.data[si + 1],
        source.bitmap.data[si + 2],
        source.bitmap.data[si + 3],
        mode,
      );
    }
  }
  invalidateImageResource(dest.bitmap);
}

/**
 * Copies `source` into `out` in row-major, tightly-packed RGBA order
 * (stride = source.width). `out` must be at least
 * `source.width * source.height * 4` bytes.
 *
 * Safe to pass `source.bitmap.data` as `out` when the region covers the
 * full bitmap (x=0, y=0, width=source.bitmap.width,
 * height=source.bitmap.height).
 */
export function extractBitmapPixels(out: Uint8ClampedArray, source: Readonly<BitmapRegion>): void {
  for (let py = 0; py < source.height; py++) {
    const sourceY = source.y + py;
    if (sourceY < 0 || sourceY >= source.bitmap.height) continue;
    for (let px = 0; px < source.width; px++) {
      const sourceX = source.x + px;
      if (sourceX < 0 || sourceX >= source.bitmap.width) continue;
      const si = (sourceY * source.bitmap.width + sourceX) * 4;
      const di = (py * source.width + px) * 4;
      out[di] = source.bitmap.data[si];
      out[di + 1] = source.bitmap.data[si + 1];
      out[di + 2] = source.bitmap.data[si + 2];
      out[di + 3] = source.bitmap.data[si + 3];
    }
  }
}

/**
 * Copies `source` into `out` as one packed `0xRRGGBBAA` color per pixel
 * (`0xRRGGBBAA` packed colors, the same packing `getBitmapPixel` returns), in row-major order with
 * stride = source.width. `out` must hold at least
 * `source.width * source.height` entries.
 *
 * This is the bulk, color-per-element counterpart to the byte-per-channel
 * `extractBitmapPixels`: use it when you want to read or compare whole
 * regions of colors without reassembling channel bytes.
 */
export function extractBitmapPixels32(out: Uint32Array, source: Readonly<BitmapRegion>): void {
  for (let py = 0; py < source.height; py++) {
    const sourceY = source.y + py;
    if (sourceY < 0 || sourceY >= source.bitmap.height) continue;
    for (let px = 0; px < source.width; px++) {
      const sourceX = source.x + px;
      if (sourceX < 0 || sourceX >= source.bitmap.width) continue;
      const si = (sourceY * source.bitmap.width + sourceX) * 4;
      out[py * source.width + px] =
        ((source.bitmap.data[si] << 24) |
          (source.bitmap.data[si + 1] << 16) |
          (source.bitmap.data[si + 2] << 8) |
          source.bitmap.data[si + 3]) >>>
        0;
    }
  }
}

/**
 * Writes `pixels` into `dest`, overwriting existing content.
 * `pixels` must be at least `dest.width * dest.height * 4` bytes in
 * row-major RGBA order.
 */
export function writeBitmapPixels(dest: Readonly<BitmapRegion>, pixels: Readonly<Uint8ClampedArray>): void {
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.bitmap.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= dest.bitmap.width) continue;
      const si = (py * dest.width + px) * 4;
      const di = (y * dest.bitmap.width + x) * 4;
      dest.bitmap.data[di] = pixels[si];
      dest.bitmap.data[di + 1] = pixels[si + 1];
      dest.bitmap.data[di + 2] = pixels[si + 2];
      dest.bitmap.data[di + 3] = pixels[si + 3];
    }
  }
  invalidateImageResource(dest.bitmap);
}

/**
 * Writes `pixels` into `dest`, overwriting existing content. Each entry is a
 * packed `0xRRGGBBAA` color (the form `setBitmapPixel` takes), read in
 * row-major order. `pixels` must hold at least `dest.width * dest.height`
 * entries. This is the color-per-element counterpart to `writeBitmapPixels`.
 */
export function writeBitmapPixels32(dest: Readonly<BitmapRegion>, pixels: Readonly<Uint32Array>): void {
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.bitmap.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= dest.bitmap.width) continue;
      const color = pixels[py * dest.width + px];
      const di = (y * dest.bitmap.width + x) * 4;
      dest.bitmap.data[di] = (color >>> 24) & 0xff;
      dest.bitmap.data[di + 1] = (color >> 16) & 0xff;
      dest.bitmap.data[di + 2] = (color >> 8) & 0xff;
      dest.bitmap.data[di + 3] = color & 0xff;
    }
  }
  invalidateImageResource(dest.bitmap);
}

// Premultiplied-free Porter-Duff coverage factors [Fa, Fb] for a BitmapCompositeMode, applied to the
// source and backdrop contributions respectively (out = Fa·αs·Cs' + Fb·αb·Cb over αo = Fa·αs + Fb·αb). The
// color-blend modes and any unknown mode composite source-over ([1, 1−αs]); the coverage operators pick
// their own factor pair. bitmap owns this Porter-Duff kernel (it does not depend on @flighthq/effects) so
// it stays self-contained for the WASM port.
function porterDuffFactors(mode: BitmapCompositeMode, srcA: number, dstA: number): [number, number] {
  switch (mode) {
    case BitmapCompositeMode.DestinationOver:
      return [1 - dstA, 1];
    case BitmapCompositeMode.SourceIn:
      return [dstA, 0];
    case BitmapCompositeMode.DestinationIn:
      return [0, srcA];
    case BitmapCompositeMode.SourceOut:
      return [1 - dstA, 0];
    case BitmapCompositeMode.DestinationOut:
      return [0, 1 - srcA];
    case BitmapCompositeMode.SourceAtop:
      return [dstA, 1 - srcA];
    case BitmapCompositeMode.DestinationAtop:
      return [1 - dstA, srcA];
    case BitmapCompositeMode.Xor:
      return [1 - dstA, 1 - srcA];
    case BitmapCompositeMode.Copy:
      return [1, 0];
    case BitmapCompositeMode.Clear:
      return [0, 0];
    default:
      return [1, 1 - srcA];
  }
}

// Separable per-channel color blend on 0..255 values. The coverage operators, Normal, and any unlisted
// mode return the source channel unchanged, so the composite reduces to the operator's Porter-Duff combine
// with no color mixing.
function blendChannel(mode: BitmapCompositeMode, cb: number, cs: number): number {
  switch (mode) {
    case BitmapCompositeMode.Multiply:
      return (cb * cs) / 255;
    case BitmapCompositeMode.Screen:
      return cb + cs - (cb * cs) / 255;
    case BitmapCompositeMode.Add:
      return Math.min(255, cb + cs);
    case BitmapCompositeMode.Subtract:
      return Math.max(0, cb - cs);
    case BitmapCompositeMode.Darken:
      return Math.min(cb, cs);
    case BitmapCompositeMode.Lighten:
      return Math.max(cb, cs);
    case BitmapCompositeMode.Difference:
      return Math.abs(cb - cs);
    case BitmapCompositeMode.Exclusion:
      return cb + cs - (2 * cb * cs) / 255;
    case BitmapCompositeMode.Overlay:
      return cb < 128 ? (2 * cb * cs) / 255 : 255 - (2 * (255 - cb) * (255 - cs)) / 255;
    case BitmapCompositeMode.HardLight:
      return cs < 128 ? (2 * cb * cs) / 255 : 255 - (2 * (255 - cb) * (255 - cs)) / 255;
    case BitmapCompositeMode.SoftLight:
      return softLightChannel(cb, cs);
    case BitmapCompositeMode.ColorDodge:
      return cs >= 255 ? 255 : Math.min(255, (cb * 255) / (255 - cs));
    case BitmapCompositeMode.ColorBurn:
      return cs <= 0 ? 0 : 255 - Math.min(255, ((255 - cb) * 255) / cs);
    case BitmapCompositeMode.Invert:
      return 255 - cb;
    default:
      return cs;
  }
}

// W3C soft-light per channel on 0..255 (the Photoshop/CSS pegtop-free formula). `cb` = backdrop,
// `cs` = source; both 0..255. The two-branch D(cb) form used by the spec, evaluated in normalized
// 0..1 space then scaled back.
function softLightChannel(cb: number, cs: number): number {
  const b = cb / 255;
  const s = cs / 255;
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  const out = s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (d - b);
  return out * 255;
}

function compositePixelInto(
  dest: Uint8ClampedArray,
  di: number,
  r: number,
  g: number,
  b: number,
  a: number,
  mode: BitmapCompositeMode,
): void {
  const srcA = a / 255;
  const dstA = dest[di + 3] / 255;
  // W3C compositing: αo = Fa·αs + Fb·αb, Co = (Fa·αs·Cs' + Fb·αb·Cb) / αo, where Cs' is the blended source
  // color and (Fa, Fb) are the mode's Porter-Duff factors. Source-over + a blend function covers the color
  // modes; the coverage operators (Erase = DestinationOut, Alpha = DestinationIn, …) fall out of the same
  // formula with a Normal blend. Read backdrop channels before writing any of them.
  const [fa, fb] = porterDuffFactors(mode, srcA, dstA);
  const outA = fa * srcA + fb * dstA;
  if (outA <= 0) {
    dest[di] = 0;
    dest[di + 1] = 0;
    dest[di + 2] = 0;
    dest[di + 3] = 0;
    return;
  }
  const cbR = dest[di];
  const cbG = dest[di + 1];
  const cbB = dest[di + 2];
  const csR = (1 - dstA) * r + dstA * blendChannel(mode, cbR, r);
  const csG = (1 - dstA) * g + dstA * blendChannel(mode, cbG, g);
  const csB = (1 - dstA) * b + dstA * blendChannel(mode, cbB, b);
  dest[di] = Math.round((fa * srcA * csR + fb * dstA * cbR) / outA);
  dest[di + 1] = Math.round((fa * srcA * csG + fb * dstA * cbG) / outA);
  dest[di + 2] = Math.round((fa * srcA * csB + fb * dstA * cbB) / outA);
  dest[di + 3] = Math.round(outA * 255);
}
