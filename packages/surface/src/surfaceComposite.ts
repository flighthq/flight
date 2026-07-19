import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceRegion } from '@flighthq/types';
import { AdvancedBlendMode, BlendMode } from '@flighthq/types';

/**
 * Alpha-composites `pixels` over `dest`. `pixels` must be at least
 * `dest.width * dest.height * 4` bytes in row-major RGBA order.
 *
 * `blendMode` selects how the source combines with the backdrop. Separable
 * blends applied before the Porter-Duff source-over: Normal (default) and Layer
 * (= Normal), Multiply, Screen, Add, Subtract, Darken, Lighten, Difference,
 * Overlay, Hardlight, Invert. Erase is a destination-out knockout. Alpha and
 * Shader are display-list concepts with no surface meaning and throw.
 */
export function compositeSurfacePixels(
  dest: Readonly<SurfaceRegion>,
  pixels: Readonly<Uint8ClampedArray>,
  blendMode: BlendMode = BlendMode.Normal,
): void {
  assertCompositeBlendMode(blendMode);
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
        blendMode,
      );
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Alpha-composites `source` over `dest`. See `compositeSurfacePixels` for the
 * `blendMode` semantics.
 */
export function compositeSurfaceRegion(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  blendMode: BlendMode = BlendMode.Normal,
): void {
  assertCompositeBlendMode(blendMode);
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
        blendMode,
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

// Throws once, up front, for blend modes that have no surface-compositing meaning,
// rather than silently degrading to Normal mid-loop.
function assertCompositeBlendMode(blendMode: BlendMode): void {
  if (blendMode === BlendMode.Alpha) {
    throw new Error(`BlendMode.${blendMode} is not supported by surface compositing`);
  }
}

// Separable per-channel blend on 0..255 values. Normal/Layer (and any mode not
// listed) return the source channel unchanged, reducing the composite to
// source-over.
function blendChannel(mode: BlendMode, cb: number, cs: number): number {
  switch (mode) {
    case BlendMode.Multiply:
      return (cb * cs) / 255;
    case BlendMode.Screen:
      return cb + cs - (cb * cs) / 255;
    case BlendMode.Add:
      return Math.min(255, cb + cs);
    case BlendMode.Subtract:
      return Math.max(0, cb - cs);
    case BlendMode.Darken:
      return Math.min(cb, cs);
    case BlendMode.Lighten:
      return Math.max(cb, cs);
    case AdvancedBlendMode.Difference:
      return Math.abs(cb - cs);
    case AdvancedBlendMode.Exclusion:
      return cb + cs - (2 * cb * cs) / 255;
    case AdvancedBlendMode.Overlay:
      return cb < 128 ? (2 * cb * cs) / 255 : 255 - (2 * (255 - cb) * (255 - cs)) / 255;
    case AdvancedBlendMode.HardLight:
      return cs < 128 ? (2 * cb * cs) / 255 : 255 - (2 * (255 - cb) * (255 - cs)) / 255;
    case AdvancedBlendMode.SoftLight:
      return softLightChannel(cb, cs);
    case AdvancedBlendMode.ColorDodge:
      return cs >= 255 ? 255 : Math.min(255, (cb * 255) / (255 - cs));
    case AdvancedBlendMode.ColorBurn:
      return cs <= 0 ? 0 : 255 - Math.min(255, ((255 - cb) * 255) / cs);
    case BlendMode.Invert:
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
  blendMode: BlendMode,
): void {
  const srcA = a / 255;
  const dstA = dest[di + 3] / 255;
  // Erase is a destination-out knockout: the source alpha carves into the
  // backdrop's alpha, leaving its color untouched.
  if (blendMode === BlendMode.Erase) {
    const eraseA = dstA * (1 - srcA);
    if (eraseA <= 0) {
      dest[di] = 0;
      dest[di + 1] = 0;
      dest[di + 2] = 0;
    }
    dest[di + 3] = Math.round(eraseA * 255);
    return;
  }
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    dest[di] = 0;
    dest[di + 1] = 0;
    dest[di + 2] = 0;
    dest[di + 3] = 0;
    return;
  }
  // W3C compositing: mix the blended color into the source by the backdrop alpha,
  // then source-over. Read backdrop channels before writing any of them.
  const cbR = dest[di];
  const cbG = dest[di + 1];
  const cbB = dest[di + 2];
  const csR = (1 - dstA) * r + dstA * blendChannel(blendMode, cbR, r);
  const csG = (1 - dstA) * g + dstA * blendChannel(blendMode, cbG, g);
  const csB = (1 - dstA) * b + dstA * blendChannel(blendMode, cbB, b);
  dest[di] = Math.round((csR * srcA + cbR * dstA * (1 - srcA)) / outA);
  dest[di + 1] = Math.round((csG * srcA + cbG * dstA * (1 - srcA)) / outA);
  dest[di + 2] = Math.round((csB * srcA + cbB * dstA * (1 - srcA)) / outA);
  dest[di + 3] = Math.round(outA * 255);
}
