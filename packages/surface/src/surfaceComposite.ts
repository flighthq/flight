import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceRegion } from '@flighthq/types';
import { SurfaceCompositeMode } from '@flighthq/types';

/**
 * Alpha-composites `pixels` over `dest`. `pixels` must be at least
 * `dest.width * dest.height * 4` bytes in row-major RGBA order.
 *
 * `mode` is a SurfaceCompositeMode — surface's single vocabulary spanning both the color-blend functions
 * (Normal (default), Multiply, Screen, Add, Subtract, Darken, Lighten, Difference, Exclusion, Overlay,
 * HardLight, SoftLight, ColorDodge, ColorBurn, Invert) and the Porter-Duff coverage operators (SourceOver,
 * DestinationOut = erase, DestinationIn = alpha mask, Copy, Clear, Xor, and the atop/in/out set). A
 * color-blend mode composites source-over; a coverage operator applies its factors with a Normal blend. An
 * unknown mode composites source-over.
 */
export function compositeSurfacePixels(
  dest: Readonly<SurfaceRegion>,
  pixels: Readonly<Uint8ClampedArray>,
  mode: SurfaceCompositeMode = SurfaceCompositeMode.Normal,
): void {
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.surface.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= dest.surface.width) continue;
      const si = (py * dest.width + px) * 4;
      compositePixelInto(
        dest.surface.data,
        (y * dest.surface.width + x) * 4,
        pixels[si],
        pixels[si + 1],
        pixels[si + 2],
        pixels[si + 3],
        mode,
      );
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Alpha-composites `source` over `dest`. See `compositeSurfacePixels` for the
 * `mode` semantics.
 */
export function compositeSurfaceRegion(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  mode: SurfaceCompositeMode = SurfaceCompositeMode.Normal,
): void {
  const sw = Math.min(dest.width, source.width);
  const sh = Math.min(dest.height, source.height);
  for (let py = 0; py < sh; py++) {
    const sourceY = source.y + py;
    const y = dest.y + py;
    if (sourceY < 0 || sourceY >= source.surface.height || y < 0 || y >= dest.surface.height) continue;
    for (let px = 0; px < sw; px++) {
      const sourceX = source.x + px;
      const x = dest.x + px;
      if (sourceX < 0 || sourceX >= source.surface.width || x < 0 || x >= dest.surface.width) continue;
      const si = (sourceY * source.surface.width + sourceX) * 4;
      compositePixelInto(
        dest.surface.data,
        (y * dest.surface.width + x) * 4,
        source.surface.data[si],
        source.surface.data[si + 1],
        source.surface.data[si + 2],
        source.surface.data[si + 3],
        mode,
      );
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Copies `source` into `out` in row-major, tightly-packed RGBA order
 * (stride = source.width). `out` must be at least
 * `source.width * source.height * 4` bytes.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface (x=0, y=0, width=source.surface.width,
 * height=source.surface.height).
 */
export function extractSurfacePixels(out: Uint8ClampedArray, source: Readonly<SurfaceRegion>): void {
  for (let py = 0; py < source.height; py++) {
    const sourceY = source.y + py;
    if (sourceY < 0 || sourceY >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const sourceX = source.x + px;
      if (sourceX < 0 || sourceX >= source.surface.width) continue;
      const si = (sourceY * source.surface.width + sourceX) * 4;
      const di = (py * source.width + px) * 4;
      out[di] = source.surface.data[si];
      out[di + 1] = source.surface.data[si + 1];
      out[di + 2] = source.surface.data[si + 2];
      out[di + 3] = source.surface.data[si + 3];
    }
  }
}

/**
 * Copies `source` into `out` as one packed `0xRRGGBBAA` color per pixel
 * (`0xRRGGBBAA` packed colors, the same packing `getSurfacePixel` returns), in row-major order with
 * stride = source.width. `out` must hold at least
 * `source.width * source.height` entries.
 *
 * This is the bulk, color-per-element counterpart to the byte-per-channel
 * `extractSurfacePixels`: use it when you want to read or compare whole
 * regions of colors without reassembling channel bytes.
 */
export function extractSurfacePixels32(out: Uint32Array, source: Readonly<SurfaceRegion>): void {
  for (let py = 0; py < source.height; py++) {
    const sourceY = source.y + py;
    if (sourceY < 0 || sourceY >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const sourceX = source.x + px;
      if (sourceX < 0 || sourceX >= source.surface.width) continue;
      const si = (sourceY * source.surface.width + sourceX) * 4;
      out[py * source.width + px] =
        ((source.surface.data[si] << 24) |
          (source.surface.data[si + 1] << 16) |
          (source.surface.data[si + 2] << 8) |
          source.surface.data[si + 3]) >>>
        0;
    }
  }
}

/**
 * Writes `pixels` into `dest`, overwriting existing content.
 * `pixels` must be at least `dest.width * dest.height * 4` bytes in
 * row-major RGBA order.
 */
export function writeSurfacePixels(dest: Readonly<SurfaceRegion>, pixels: Readonly<Uint8ClampedArray>): void {
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.surface.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= dest.surface.width) continue;
      const si = (py * dest.width + px) * 4;
      const di = (y * dest.surface.width + x) * 4;
      dest.surface.data[di] = pixels[si];
      dest.surface.data[di + 1] = pixels[si + 1];
      dest.surface.data[di + 2] = pixels[si + 2];
      dest.surface.data[di + 3] = pixels[si + 3];
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Writes `pixels` into `dest`, overwriting existing content. Each entry is a
 * packed `0xRRGGBBAA` color (the form `setSurfacePixel` takes), read in
 * row-major order. `pixels` must hold at least `dest.width * dest.height`
 * entries. This is the color-per-element counterpart to `writeSurfacePixels`.
 */
export function writeSurfacePixels32(dest: Readonly<SurfaceRegion>, pixels: Readonly<Uint32Array>): void {
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.surface.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= dest.surface.width) continue;
      const color = pixels[py * dest.width + px];
      const di = (y * dest.surface.width + x) * 4;
      dest.surface.data[di] = (color >>> 24) & 0xff;
      dest.surface.data[di + 1] = (color >> 16) & 0xff;
      dest.surface.data[di + 2] = (color >> 8) & 0xff;
      dest.surface.data[di + 3] = color & 0xff;
    }
  }
  invalidateImageResource(dest.surface);
}

// Premultiplied-free Porter-Duff coverage factors [Fa, Fb] for a SurfaceCompositeMode, applied to the
// source and backdrop contributions respectively (out = Fa·αs·Cs' + Fb·αb·Cb over αo = Fa·αs + Fb·αb). The
// color-blend modes and any unknown mode composite source-over ([1, 1−αs]); the coverage operators pick
// their own factor pair. surface owns this Porter-Duff kernel (it does not depend on @flighthq/effects) so
// it stays self-contained for the WASM port.
function porterDuffFactors(mode: SurfaceCompositeMode, srcA: number, dstA: number): [number, number] {
  switch (mode) {
    case SurfaceCompositeMode.DestinationOver:
      return [1 - dstA, 1];
    case SurfaceCompositeMode.SourceIn:
      return [dstA, 0];
    case SurfaceCompositeMode.DestinationIn:
      return [0, srcA];
    case SurfaceCompositeMode.SourceOut:
      return [1 - dstA, 0];
    case SurfaceCompositeMode.DestinationOut:
      return [0, 1 - srcA];
    case SurfaceCompositeMode.SourceAtop:
      return [dstA, 1 - srcA];
    case SurfaceCompositeMode.DestinationAtop:
      return [1 - dstA, srcA];
    case SurfaceCompositeMode.Xor:
      return [1 - dstA, 1 - srcA];
    case SurfaceCompositeMode.Copy:
      return [1, 0];
    case SurfaceCompositeMode.Clear:
      return [0, 0];
    default:
      return [1, 1 - srcA];
  }
}

// Separable per-channel color blend on 0..255 values. The coverage operators, Normal, and any unlisted
// mode return the source channel unchanged, so the composite reduces to the operator's Porter-Duff combine
// with no color mixing.
function blendChannel(mode: SurfaceCompositeMode, cb: number, cs: number): number {
  switch (mode) {
    case SurfaceCompositeMode.Multiply:
      return (cb * cs) / 255;
    case SurfaceCompositeMode.Screen:
      return cb + cs - (cb * cs) / 255;
    case SurfaceCompositeMode.Add:
      return Math.min(255, cb + cs);
    case SurfaceCompositeMode.Subtract:
      return Math.max(0, cb - cs);
    case SurfaceCompositeMode.Darken:
      return Math.min(cb, cs);
    case SurfaceCompositeMode.Lighten:
      return Math.max(cb, cs);
    case SurfaceCompositeMode.Difference:
      return Math.abs(cb - cs);
    case SurfaceCompositeMode.Exclusion:
      return cb + cs - (2 * cb * cs) / 255;
    case SurfaceCompositeMode.Overlay:
      return cb < 128 ? (2 * cb * cs) / 255 : 255 - (2 * (255 - cb) * (255 - cs)) / 255;
    case SurfaceCompositeMode.HardLight:
      return cs < 128 ? (2 * cb * cs) / 255 : 255 - (2 * (255 - cb) * (255 - cs)) / 255;
    case SurfaceCompositeMode.SoftLight:
      return softLightChannel(cb, cs);
    case SurfaceCompositeMode.ColorDodge:
      return cs >= 255 ? 255 : Math.min(255, (cb * 255) / (255 - cs));
    case SurfaceCompositeMode.ColorBurn:
      return cs <= 0 ? 0 : 255 - Math.min(255, ((255 - cb) * 255) / cs);
    case SurfaceCompositeMode.Invert:
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
  mode: SurfaceCompositeMode,
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
