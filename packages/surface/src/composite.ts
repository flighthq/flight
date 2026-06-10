import type { SurfaceRegion } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

/**
 * Alpha-composites `pixels` over `dest`. `pixels` must be at least
 * `dest.width * dest.height * 4` bytes in row-major RGBA order.
 *
 * `blendMode` selects the separable blend applied to the source color before
 * the Porter-Duff source-over. Supported: Normal (default), Multiply, Screen,
 * Add, Subtract, Darken, Lighten, Difference. Other modes fall back to Normal.
 */
export function compositeSurfacePixels(
  dest: SurfaceRegion,
  pixels: Uint8ClampedArray,
  blendMode: BlendMode = BlendMode.Normal,
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
        blendMode,
      );
    }
  }
}

/**
 * Alpha-composites `source` over `dest`. See `compositeSurfacePixels` for the
 * `blendMode` semantics.
 */
export function compositeSurfaceRegion(
  dest: SurfaceRegion,
  source: Readonly<SurfaceRegion>,
  blendMode: BlendMode = BlendMode.Normal,
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
        blendMode,
      );
    }
  }
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
 * Writes `pixels` into `dest`, overwriting existing content.
 * `pixels` must be at least `dest.width * dest.height * 4` bytes in
 * row-major RGBA order.
 */
export function writeSurfacePixels(dest: SurfaceRegion, pixels: Uint8ClampedArray): void {
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
}

// ─── Private helpers ──────────────────────────────────────────────────────────

// Separable per-channel blend on 0..255 values. Normal (and any unsupported mode)
// returns the source channel unchanged, reducing the composite to source-over.
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
    case BlendMode.Difference:
      return Math.abs(cb - cs);
    default:
      return cs;
  }
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
