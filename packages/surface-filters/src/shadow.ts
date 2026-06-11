import type { SurfaceRegion } from '@flighthq/types';

import { blurSurfacePixelsHorizontal, blurSurfacePixelsVertical } from './blur';

export interface SurfaceBlurOptions {
  radiusX?: number;
  radiusY?: number;
  passes?: number;
}

export interface SurfaceDropShadowFilterOptions extends SurfaceBlurOptions {
  /** Packed 0xRRGGBBAA shadow color. Default 0x000000ff (opaque black). */
  color?: number;
  /** Overall intensity multiplier applied to the shadow alpha. Default 1. */
  intensity?: number;
}

export interface SurfaceGlowFilterOptions extends SurfaceBlurOptions {
  /** Packed 0xRRGGBBAA glow color. Default 0xff0000ff (opaque red). */
  color?: number;
  /** Overall intensity multiplier applied to the glow alpha. Default 1. */
  intensity?: number;
}

export interface SurfaceInnerGlowFilterOptions extends SurfaceBlurOptions {
  /** Packed 0xRRGGBBAA inner glow color. Default 0xff0000ff (opaque red). */
  color?: number;
  /** Overall intensity multiplier applied to the glow alpha. Default 1. */
  intensity?: number;
}

export interface SurfaceInnerShadowFilterOptions extends SurfaceBlurOptions {
  /** Packed 0xRRGGBBAA inner shadow color. Default 0x000000ff (opaque black). */
  color?: number;
  /** Overall intensity multiplier applied to the shadow alpha. Default 1. */
  intensity?: number;
}

/**
 * Produces the blurred shadow mask for a drop shadow effect, writing into
 * `out`. The result is a tinted, blurred alpha mask derived from `source`.
 *
 * To complete the effect, composite `out` onto the destination at the shadow
 * offset, then optionally composite the original source on top:
 *
 *   compositeSurfacePixels(destRegion, out);   // shadow at (dx+offsetX, dy+offsetY)
 *   compositeSurfaceRegion(destRegion, source); // omit if hideObject
 *
 * `scratch` must be at least `source.width * source.height * 4` bytes.
 * Its contents are undefined after the call.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface.
 */
export function applySurfaceDropShadowFilter(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceDropShadowFilterOptions> = {},
): void {
  tintSurfaceAlphaMask(out, source, options.color ?? 0x000000ff, options.intensity ?? 1);
  applyBlurPasses(out, scratch, source.width, source.height, options);
}

/**
 * Produces the blurred glow mask for a glow effect, writing into `out`.
 * The result is a tinted, blurred alpha mask derived from `source`.
 *
 * To complete the effect, composite `out` onto the destination, then
 * optionally composite the original source on top:
 *
 *   compositeSurfacePixels(destRegion, out);   // glow
 *   compositeSurfaceRegion(destRegion, source); // omit if knockout
 *
 * `scratch` must be at least `source.width * source.height * 4` bytes.
 * Its contents are undefined after the call.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface.
 */
export function applySurfaceGlowFilter(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceGlowFilterOptions> = {},
): void {
  tintSurfaceAlphaMask(out, source, options.color ?? 0xff0000ff, options.intensity ?? 1);
  applyBlurPasses(out, scratch, source.width, source.height, options);
}

/**
 * Produces the inner glow mask for a glow that hugs the inside of the source's
 * alpha boundary, writing into `out`. The inverted source alpha is blurred so
 * that the "outside" bleeds inward, then clipped by the original source alpha so
 * the effect stays within the shape, then tinted.
 *
 * To complete the effect, composite `out` over the original source:
 *
 *   compositeSurfaceRegion(destRegion, source);
 *   compositeSurfacePixels(destRegion, out);   // glow on top, inside the shape
 *
 * `scratch` must be at least `source.width * source.height * 4` bytes; its
 * contents are undefined after the call.
 *
 * `out` must NOT alias `source.surface.data`: the original source alpha is read
 * again after blurring, so overwriting the source destroys the clip mask.
 */
export function applySurfaceInnerGlowFilter(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceInnerGlowFilterOptions> = {},
): void {
  applyInnerEffect(out, scratch, source, options.color ?? 0xff0000ff, options);
}

/**
 * Produces the inner shadow mask for a shadow that hugs the inside of the
 * source's alpha boundary, writing into `out`. Identical to
 * `applySurfaceInnerGlowFilter` except for the default color (opaque black).
 *
 * To complete the effect, composite `out` over the original source.
 *
 * `scratch` must be at least `source.width * source.height * 4` bytes; its
 * contents are undefined after the call.
 *
 * `out` must NOT alias `source.surface.data` — the original source alpha is read
 * again after blurring to clip the result.
 */
export function applySurfaceInnerShadowFilter(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceInnerShadowFilterOptions> = {},
): void {
  applyInnerEffect(out, scratch, source, options.color ?? 0x000000ff, options);
}

function applyInnerEffect(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  color: number,
  options: Readonly<SurfaceBlurOptions & { intensity?: number }>,
): void {
  const w = source.width;
  const h = source.height;

  // Step 1: write the inverted source alpha into out (rgb 0). High outside the
  // shape, low inside — so the blur bleeds the exterior inward across the edge.
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      out[di] = 0;
      out[di + 1] = 0;
      out[di + 2] = 0;
      out[di + 3] = 255 - readSourceAlpha(source, px, py);
    }
  }

  // Step 2: blur the inverted-alpha field in place (ping-ponging through scratch).
  applyBlurPasses(out, scratch, w, h, options);

  // Step 3: tint, and clip by the original source alpha so the glow stays inside.
  const cr = (color >>> 24) & 0xff;
  const cg = (color >> 16) & 0xff;
  const cb = (color >> 8) & 0xff;
  const ca = (color & 0xff) / 255;
  const scale = Math.max(0, options.intensity ?? 1) * ca;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const blurred = out[di + 3];
      const sourceAlpha = readSourceAlpha(source, px, py);
      out[di] = cr;
      out[di + 1] = cg;
      out[di + 2] = cb;
      out[di + 3] = Math.min(255, Math.round((blurred * sourceAlpha * scale) / 255));
    }
  }
}

function applyBlurPasses(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  width: number,
  height: number,
  options: Readonly<SurfaceBlurOptions>,
): void {
  const radiusX = Math.max(0, Math.round(options.radiusX ?? 2));
  const radiusY = Math.max(0, Math.round(options.radiusY ?? 2));
  const passes = Math.max(1, Math.round(options.passes ?? 1));

  let a = out;
  let b = scratch;

  for (let pass = 0; pass < passes; pass++) {
    if (radiusX > 0) {
      blurSurfacePixelsHorizontal(b, a, width, height, radiusX);
      const t = a;
      a = b;
      b = t;
    }
    if (radiusY > 0) {
      blurSurfacePixelsVertical(b, a, width, height, radiusY);
      const t = a;
      a = b;
      b = t;
    }
  }

  if (a !== out) {
    out.set(a.subarray(0, width * height * 4));
  }
}

function readSourceAlpha(source: Readonly<SurfaceRegion>, px: number, py: number): number {
  const sx = source.x + px;
  const sy = source.y + py;
  if (sx < 0 || sx >= source.surface.width || sy < 0 || sy >= source.surface.height) return 0;
  return source.surface.data[(sy * source.surface.width + sx) * 4 + 3];
}

// Used internally by drop-shadow and glow filters.
function tintSurfaceAlphaMask(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  color: number,
  intensity: number,
): void {
  const cr = (color >>> 24) & 0xff;
  const cg = (color >> 16) & 0xff;
  const cb = (color >> 8) & 0xff;
  const ca = (color & 0xff) / 255;
  const alphaScale = Math.max(0, intensity) * ca;
  for (let py = 0; py < source.height; py++) {
    const sourceY = source.y + py;
    if (sourceY < 0 || sourceY >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const sourceX = source.x + px;
      if (sourceX < 0 || sourceX >= source.surface.width) continue;
      const si = (sourceY * source.surface.width + sourceX) * 4;
      const di = (py * source.width + px) * 4;
      out[di] = cr;
      out[di + 1] = cg;
      out[di + 2] = cb;
      out[di + 3] = Math.min(255, Math.round(source.surface.data[si + 3] * alphaScale));
    }
  }
}
