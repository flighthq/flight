import type { SurfaceBevelOptions, SurfaceRegion } from '@flighthq/types';

import { blurSurfacePixelsHorizontal, blurSurfacePixelsVertical } from './surfaceBlur';

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
 * 'both' applies no clipping.
 *
 * To complete the effect, composite `out` over the original source.
 *
 * `scratch` must be at least `source.width * source.height * 4` bytes; it must
 * be a distinct buffer from `out` (the blurred alpha is sampled while `out` is
 * written). Its contents are undefined after the call.
 *
 * `out` must NOT alias `source.surface.data`: `out` is used as the blur scratch,
 * and the source alpha is read again afterward for `inner`/`outer` clipping.
 */
export function bevelSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceBevelOptions> = {},
): void {
  const w = source.width;
  const h = source.height;
  const angle = options.angle ?? Math.PI / 4;
  const distance = options.distance ?? 4;
  const offsetX = Math.round(Math.cos(angle) * distance);
  const offsetY = Math.round(Math.sin(angle) * distance);
  const type = options.type ?? 'inner';
  const intensity = options.intensity ?? 1;
  const highlightColor = options.highlightColor ?? 0xffffffff;
  const shadowColor = options.shadowColor ?? 0x000000ff;

  // Build the blurred alpha field `m` in scratch, using out as ping-pong buffer.
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      scratch[di] = 0;
      scratch[di + 1] = 0;
      scratch[di + 2] = 0;
      scratch[di + 3] = readSourceAlpha(source, px, py);
    }
  }
  blurField(scratch, out, w, h, options.radiusX, options.radiusY, options.passes);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const lit = sampleField(scratch, w, h, px - offsetX, py - offsetY);
      const shade = sampleField(scratch, w, h, px + offsetX, py + offsetY);
      const gradient = lit - shade;

      const color = gradient >= 0 ? highlightColor : shadowColor;
      const colorAlpha = (color & 0xff) / 255;
      const clip =
        type === 'inner'
          ? readSourceAlpha(source, px, py) / 255
          : type === 'outer'
            ? 1 - readSourceAlpha(source, px, py) / 255
            : 1;
      const edgeIntensity = Math.min(1, Math.abs(gradient) * intensity);

      out[di] = (color >>> 24) & 0xff;
      out[di + 1] = (color >> 16) & 0xff;
      out[di + 2] = (color >> 8) & 0xff;
      out[di + 3] = Math.round(edgeIntensity * colorAlpha * clip * 255);
    }
  }
}

function blurField(
  field: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  w: number,
  h: number,
  radiusX: number | undefined,
  radiusY: number | undefined,
  passes: number | undefined,
): void {
  const rx = Math.max(0, Math.round(radiusX ?? 2));
  const ry = Math.max(0, Math.round(radiusY ?? 2));
  const p = Math.max(1, Math.round(passes ?? 1));
  let a = field;
  let b = scratch;
  for (let pass = 0; pass < p; pass++) {
    if (rx > 0) {
      blurSurfacePixelsHorizontal(b, a, w, h, rx);
      const t = a;
      a = b;
      b = t;
    }
    if (ry > 0) {
      blurSurfacePixelsVertical(b, a, w, h, ry);
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
