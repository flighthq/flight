import type { SurfaceRegion } from '@flighthq/types';

import type { SurfaceBevelType } from './surfaceBevel';
import { blurSurfacePixelsHorizontal, blurSurfacePixelsVertical } from './surfaceBlur';

export interface SurfaceGradientBevelOptions {
  /** Light direction in radians, pointing toward the light source. Default π/4. */
  angle?: number;
  /** Sampling offset along the light axis, in pixels. Default 4. */
  distance?: number;
  radiusX?: number;
  radiusY?: number;
  passes?: number;
  /** Overall opacity multiplier. Default 1. */
  intensity?: number;
  /** Where the bevel is drawn relative to the shape. Default 'inner'. */
  type?: SurfaceBevelType;
}

export interface SurfaceGradientGlowOptions {
  radiusX?: number;
  radiusY?: number;
  passes?: number;
  /** Overall opacity multiplier. Default 1. */
  intensity?: number;
}

/**
 * Fills `out` (256 RGBA entries, 1024 bytes) with a gradient lookup table built
 * from parallel `colors` (packed 0xRRGGBB), `alphas` (0..1), and `ratios`
 * (0..255, ascending) arrays. Indices below the first ratio take the first stop;
 * indices above the last take the last stop; in between, channels are linearly
 * interpolated.
 */
export function buildSurfaceGradientRamp(
  out: Uint8ClampedArray,
  colors: ReadonlyArray<number>,
  alphas: ReadonlyArray<number>,
  ratios: ReadonlyArray<number>,
): void {
  const n = ratios.length;
  if (n === 0) {
    out.fill(0);
    return;
  }
  for (let i = 0; i < 256; i++) {
    let r: number;
    let g: number;
    let b: number;
    let a: number;
    if (i <= ratios[0]) {
      r = (colors[0] >> 16) & 0xff;
      g = (colors[0] >> 8) & 0xff;
      b = colors[0] & 0xff;
      a = alphas[0];
    } else if (i >= ratios[n - 1]) {
      r = (colors[n - 1] >> 16) & 0xff;
      g = (colors[n - 1] >> 8) & 0xff;
      b = colors[n - 1] & 0xff;
      a = alphas[n - 1];
    } else {
      let j = 0;
      while (j < n - 1 && ratios[j + 1] < i) j++;
      const span = ratios[j + 1] - ratios[j];
      const t = span > 0 ? (i - ratios[j]) / span : 0;
      r = lerp((colors[j] >> 16) & 0xff, (colors[j + 1] >> 16) & 0xff, t);
      g = lerp((colors[j] >> 8) & 0xff, (colors[j + 1] >> 8) & 0xff, t);
      b = lerp(colors[j] & 0xff, colors[j + 1] & 0xff, t);
      a = lerp(alphas[j], alphas[j + 1], t);
    }
    const oi = i * 4;
    out[oi] = Math.round(r);
    out[oi + 1] = Math.round(g);
    out[oi + 2] = Math.round(b);
    out[oi + 3] = Math.round(a * 255);
  }
}

/**
 * Produces a gradient bevel mask in `out`. Like `bevelSurface`, but the signed
 * edge gradient (-1..1) indexes the 256-entry `ramp` instead of selecting one of
 * two flat colors: -1 maps to ramp index 0 (shadow side), 0 to 128 (flat,
 * typically transparent), +1 to 255 (highlight side).
 *
 * `ramp` must be 256 RGBA entries (1024 bytes); build it with
 * `buildSurfaceGradientRamp`. `scratch` must be a distinct buffer from `out`,
 * at least `source.width * source.height * 4` bytes; its contents are undefined
 * after the call.
 *
 * `out` must NOT alias `source.surface.data`: `out` is used as the blur scratch,
 * and the source alpha is read again afterward for `inner`/`outer` clipping.
 */
export function gradientBevelSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  ramp: Readonly<Uint8ClampedArray>,
  options: Readonly<SurfaceGradientBevelOptions> = {},
): void {
  const w = source.width;
  const h = source.height;
  const angle = options.angle ?? Math.PI / 4;
  const distance = options.distance ?? 4;
  const offsetX = Math.round(Math.cos(angle) * distance);
  const offsetY = Math.round(Math.sin(angle) * distance);
  const type = options.type ?? 'inner';
  const intensity = options.intensity ?? 1;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      scratch[di] = 0;
      scratch[di + 1] = 0;
      scratch[di + 2] = 0;
      scratch[di + 3] = readSourceAlpha(source, px, py);
    }
  }
  blurAlphaField(scratch, out, w, h, options.radiusX, options.radiusY, options.passes);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const lit = sampleField(scratch, w, h, px - offsetX, py - offsetY);
      const shade = sampleField(scratch, w, h, px + offsetX, py + offsetY);
      const gradient = lit - shade;
      const idx = Math.max(0, Math.min(255, Math.round((gradient * 0.5 + 0.5) * 255)));
      const ri = idx * 4;
      const clip =
        type === 'inner'
          ? readSourceAlpha(source, px, py) / 255
          : type === 'outer'
            ? 1 - readSourceAlpha(source, px, py) / 255
            : 1;
      out[di] = ramp[ri];
      out[di + 1] = ramp[ri + 1];
      out[di + 2] = ramp[ri + 2];
      out[di + 3] = Math.min(255, Math.round(ramp[ri + 3] * intensity * clip));
    }
  }
}

/**
 * Produces a gradient glow mask in `out`. Like `glowSurface`, but the blurred
 * source alpha (0..255) indexes the 256-entry `ramp` for both color and opacity,
 * so the glow color varies with distance from the shape.
 *
 * `ramp` must be 256 RGBA entries (1024 bytes); build it with
 * `buildSurfaceGradientRamp`. `scratch` must be at least
 * `source.width * source.height * 4` bytes; its contents are undefined after the
 * call. Safe to pass `source.surface.data` as `out` for a full-surface region.
 */
export function gradientGlowSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  ramp: Readonly<Uint8ClampedArray>,
  options: Readonly<SurfaceGradientGlowOptions> = {},
): void {
  const w = source.width;
  const h = source.height;
  const intensity = options.intensity ?? 1;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      out[di] = 0;
      out[di + 1] = 0;
      out[di + 2] = 0;
      out[di + 3] = readSourceAlpha(source, px, py);
    }
  }
  blurAlphaField(out, scratch, w, h, options.radiusX, options.radiusY, options.passes);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const ri = out[di + 3] * 4;
      out[di] = ramp[ri];
      out[di + 1] = ramp[ri + 1];
      out[di + 2] = ramp[ri + 2];
      out[di + 3] = Math.min(255, Math.round(ramp[ri + 3] * intensity));
    }
  }
}

function blurAlphaField(
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

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function readSourceAlpha(source: Readonly<SurfaceRegion>, px: number, py: number): number {
  const sx = source.x + px;
  const sy = source.y + py;
  if (sx < 0 || sx >= source.surface.width || sy < 0 || sy >= source.surface.height) return 0;
  return source.surface.data[(sy * source.surface.width + sx) * 4 + 3];
}

function sampleField(field: Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  return field[(y * w + x) * 4 + 3] / 255;
}
