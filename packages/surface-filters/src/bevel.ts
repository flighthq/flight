import type { SurfaceRegion } from '@flighthq/types';

import { blurSurfacePixelsHorizontal, blurSurfacePixelsVertical } from './blur';

export type SurfaceBevelType = 'full' | 'inner' | 'outer';

export interface SurfaceBevelFilterOptions {
  /** Light direction in radians, pointing toward the light source. Default π/4. */
  angle?: number;
  /** Sampling offset along the light axis, in pixels. Default 4. */
  distance?: number;
  blurX?: number;
  blurY?: number;
  quality?: number;
  /** Packed RGB of the lit edge. Default 0xffffff. */
  highlightColor?: number;
  /** Highlight opacity 0..1. Default 1. */
  highlightAlpha?: number;
  /** Packed RGB of the shaded edge. Default 0x000000. */
  shadowColor?: number;
  /** Shadow opacity 0..1. Default 1. */
  shadowAlpha?: number;
  /** Overall intensity multiplier. Default 1. */
  strength?: number;
  /** Where the bevel is drawn relative to the shape. Default 'inner'. */
  type?: SurfaceBevelType;
}

/**
 * Produces a bevel mask in `out`: a tinted highlight on the edge facing the
 * light and a shadow on the opposite edge, derived from the directional
 * gradient of the source's blurred alpha.
 *
 * The edge gradient is `m(p - L) - m(p + L)` where `m` is the blurred alpha and
 * `L = (cos(angle), sin(angle)) * distance`. A positive gradient (edge facing the
 * light) draws the highlight color; a negative gradient draws the shadow color.
 *
 * `type` clips the result: 'inner' keeps it inside the shape, 'outer' outside,
 * 'full' both.
 *
 * To complete the effect, composite `out` over the original source.
 *
 * `blurBuffer` must be at least `source.width * source.height * 4` bytes; it must
 * be a distinct buffer from `out` (the blurred alpha is sampled while `out` is
 * written). Its contents are undefined after the call.
 *
 * `out` must NOT alias `source.surface.data`: `out` is used as the blur scratch,
 * and the source alpha is read again afterward for `inner`/`outer` clipping.
 */
export function applySurfaceBevelFilter(
  out: Uint8ClampedArray,
  blurBuffer: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceBevelFilterOptions> = {},
): void {
  const w = source.width;
  const h = source.height;
  const angle = options.angle ?? Math.PI / 4;
  const distance = options.distance ?? 4;
  const offsetX = Math.round(Math.cos(angle) * distance);
  const offsetY = Math.round(Math.sin(angle) * distance);
  const type = options.type ?? 'inner';
  const strength = options.strength ?? 1;
  const highlightColor = options.highlightColor ?? 0xffffff;
  const shadowColor = options.shadowColor ?? 0;
  const highlightAlpha = options.highlightAlpha ?? 1;
  const shadowAlpha = options.shadowAlpha ?? 1;

  // Build the blurred alpha field `m` in blurBuffer, using out as ping-pong scratch.
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      blurBuffer[di] = 0;
      blurBuffer[di + 1] = 0;
      blurBuffer[di + 2] = 0;
      blurBuffer[di + 3] = readSourceAlpha(source, px, py);
    }
  }
  blurField(blurBuffer, out, w, h, options.blurX, options.blurY, options.quality);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const lit = sampleField(blurBuffer, w, h, px - offsetX, py - offsetY);
      const shade = sampleField(blurBuffer, w, h, px + offsetX, py + offsetY);
      const gradient = lit - shade;

      const color = gradient >= 0 ? highlightColor : shadowColor;
      const baseAlpha = gradient >= 0 ? highlightAlpha : shadowAlpha;
      const clip =
        type === 'inner'
          ? readSourceAlpha(source, px, py) / 255
          : type === 'outer'
            ? 1 - readSourceAlpha(source, px, py) / 255
            : 1;
      const intensity = Math.min(1, Math.abs(gradient) * strength);

      out[di] = (color >> 16) & 0xff;
      out[di + 1] = (color >> 8) & 0xff;
      out[di + 2] = color & 0xff;
      out[di + 3] = Math.round(intensity * baseAlpha * clip * 255);
    }
  }
}

function blurField(
  field: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  w: number,
  h: number,
  blurX: number | undefined,
  blurY: number | undefined,
  quality: number | undefined,
): void {
  const radiusX = Math.max(0, Math.round((blurX ?? 4) / 2));
  const radiusY = Math.max(0, Math.round((blurY ?? 4) / 2));
  const passes = Math.max(1, Math.round(quality ?? 1));
  let a = field;
  let b = scratch;
  for (let pass = 0; pass < passes; pass++) {
    if (radiusX > 0) {
      blurSurfacePixelsHorizontal(b, a, w, h, radiusX);
      const t = a;
      a = b;
      b = t;
    }
    if (radiusY > 0) {
      blurSurfacePixelsVertical(b, a, w, h, radiusY);
      const t = a;
      a = b;
      b = t;
    }
  }
  if (a !== field) field.set(a.subarray(0, w * h * 4));
}

function readSourceAlpha(source: Readonly<SurfaceRegion>, px: number, py: number): number {
  const sx = source.x + px;
  const sy = source.y + py;
  if (sx < 0 || sx >= source.surface.width || sy < 0 || sy >= source.surface.height) return 0;
  return source.surface.data[(sy * source.surface.width + sx) * 4 + 3];
}

// Returns the blurred alpha at (x, y) normalized to 0..1; 0 outside the field.
function sampleField(field: Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  return field[(y * w + x) * 4 + 3] / 255;
}
