import type { SurfaceRegion } from '@flighthq/types';

import { blurSurfacePixelsHorizontal, blurSurfacePixelsVertical } from './blur';

// ─── Option types ─────────────────────────────────────────────────────────────

export interface SurfaceBlurOptions {
  blurX?: number;
  blurY?: number;
  quality?: number;
}

export interface SurfaceDropShadowFilterOptions extends SurfaceBlurOptions {
  alpha?: number;
  color?: number;
  strength?: number;
}

export interface SurfaceGlowFilterOptions extends SurfaceBlurOptions {
  alpha?: number;
  color?: number;
  strength?: number;
}

export interface SurfaceInnerGlowFilterOptions extends SurfaceBlurOptions {
  alpha?: number;
  color?: number;
  strength?: number;
}

export interface SurfaceInnerShadowFilterOptions extends SurfaceBlurOptions {
  alpha?: number;
  color?: number;
  strength?: number;
}

// ─── Filter functions ─────────────────────────────────────────────────────────

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
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Its contents are undefined after the call.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface.
 */
export function applySurfaceDropShadowFilter(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceDropShadowFilterOptions> = {},
): void {
  tintSurfaceAlphaMask(out, source, options.color ?? 0, options.alpha ?? 1, options.strength ?? 1);

  applyBlurPasses(out, blurBuffer, source.width, source.height, options);
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
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes.
 * Its contents are undefined after the call.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface.
 */
export function applySurfaceGlowFilter(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceGlowFilterOptions> = {},
): void {
  tintSurfaceAlphaMask(out, source, options.color ?? 0xff0000, options.alpha ?? 1, options.strength ?? 1);

  applyBlurPasses(out, blurBuffer, source.width, source.height, options);
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
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes; its
 * contents are undefined after the call.
 *
 * Unlike the outer glow/drop-shadow filters, `out` must NOT alias
 * `source.surface.data`: the original source alpha is read again after blurring,
 * so overwriting the source destroys the clip mask.
 */
export function applySurfaceInnerGlowFilter(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceInnerGlowFilterOptions> = {},
): void {
  applyInnerEffect(out, blurBuffer, source, options.color ?? 0xff0000, options);
}

/**
 * Produces the inner shadow mask for a shadow that hugs the inside of the
 * source's alpha boundary, writing into `out`. Identical to
 * `applySurfaceInnerGlowFilter` except for the default color (black).
 *
 * To complete the effect, composite `out` over the original source.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes; its
 * contents are undefined after the call.
 *
 * `out` must NOT alias `source.surface.data` — the original source alpha is read
 * again after blurring to clip the result.
 */
export function applySurfaceInnerShadowFilter(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceInnerShadowFilterOptions> = {},
): void {
  applyInnerEffect(out, blurBuffer, source, options.color ?? 0, options);
}

/**
 * Writes a tinted alpha mask into `out`. Each output pixel takes the given
 * RGB `color` with alpha derived from the source pixel's alpha scaled by
 * `alpha * strength`. `out` must be at least
 * `source.width * source.height * 4` bytes.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface — only the source alpha channel is read before any write.
 */
export function tintSurfaceAlphaMask(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  color: number,
  alpha: number,
  strength: number,
): void {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const alphaScale = Math.max(0, alpha) * Math.max(0, strength);
  for (let py = 0; py < source.height; py++) {
    const sourceY = source.y + py;
    if (sourceY < 0 || sourceY >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const sourceX = source.x + px;
      if (sourceX < 0 || sourceX >= source.surface.width) continue;
      const si = (sourceY * source.surface.width + sourceX) * 4;
      const di = (py * source.width + px) * 4;
      out[di] = r;
      out[di + 1] = g;
      out[di + 2] = b;
      out[di + 3] = Math.min(255, Math.round(source.surface.data[si + 3] * alphaScale));
    }
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function applyInnerEffect(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  color: number,
  options: Readonly<SurfaceBlurOptions & { alpha?: number; strength?: number }>,
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

  // Step 2: blur the inverted-alpha field in place (ping-ponging through blurBuffer).
  applyBlurPasses(out, blurBuffer, w, h, options);

  // Step 3: tint, and clip by the original source alpha so the glow stays inside.
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const scale = Math.max(0, options.alpha ?? 1) * Math.max(0, options.strength ?? 1);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const blurred = out[di + 3];
      const sourceAlpha = readSourceAlpha(source, px, py);
      out[di] = r;
      out[di + 1] = g;
      out[di + 2] = b;
      out[di + 3] = Math.min(255, Math.round((blurred * sourceAlpha * scale) / 255));
    }
  }
}

function readSourceAlpha(source: Readonly<SurfaceRegion>, px: number, py: number): number {
  const sx = source.x + px;
  const sy = source.y + py;
  if (sx < 0 || sx >= source.surface.width || sy < 0 || sy >= source.surface.height) return 0;
  return source.surface.data[(sy * source.surface.width + sx) * 4 + 3];
}

function applyBlurPasses(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  width: number,
  height: number,
  options: Readonly<SurfaceBlurOptions>,
): void {
  const radiusX = Math.max(0, Math.round((options.blurX ?? 4) / 2));
  const radiusY = Math.max(0, Math.round((options.blurY ?? 4) / 2));
  const passes = Math.max(1, Math.round(options.quality ?? 1));

  let a = out;
  let b = blurBuffer;

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
