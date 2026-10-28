// Generated from crates/flight-color/src/hsl_color_raw.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityRaw } from '@flighthq/entity/contract';

export interface HslColorRaw extends EntityRaw {
  h: number;
  s: number;
  l: number;
}

/**
 * Allocates a fresh zeroed `HslColor` for use as an `rgbToHsl` out parameter.
 */
export function allocateHslColor(): HslColorRaw {
  return Object.assign(allocateEntity<HslColorRaw>(), { h: 0, l: 0, s: 0 });
}

/**
 * Converts HSL to sRGB floats. Writes sRGB [0, 1] R/G/B to out[0..2] (h in [0, 360), s/l in
 * [0, 1]); leaves out[3] (alpha) unmodified. The conversion operates in sRGB (non-linear)
 * space, matching artist-facing color pickers.
 */
export function hslToRgb(out: Float32Array, h: number, s: number, l: number): void {
  if (s === 0.0) {
    out[0] = l;
    out[1] = l;
    out[2] = l;
    return;
  }
  const q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  const p = 2.0 * l - q;
  const hn = h / 360.0;
  out[0] = hueToRgbChannel(p, q, hn + 1.0 / 3.0);
  out[1] = hueToRgbChannel(p, q, hn);
  out[2] = hueToRgbChannel(p, q, hn - 1.0 / 3.0);
}

/**
 * HSL helper: interpolates a single channel from hue position `t`.
 */
function hueToRgbChannel(p: number, q: number, t: number): number {
  const tn = ((t % 1.0) + 1.0) % 1.0;
  if (tn < 1.0 / 6.0) {
    return p + (q - p) * 6.0 * tn;
  }
  if (tn < 1.0 / 2.0) {
    return q;
  }
  if (tn < 2.0 / 3.0) {
    return p + (q - p) * (2.0 / 3.0 - tn) * 6.0;
  }
  return p;
}

/**
 * Converts a packed sRGB `0xRRGGBBAA` color to HSL and writes to `out`.
 * `out.h` = hue in [0, 360), `out.s` = saturation [0, 1], `out.l` = lightness [0, 1].
 * Alpha is ignored. The conversion operates in sRGB (non-linear) space, consistent with
 * artist-facing HSL color pickers.
 */
export function rgbToHsl(out: HslColorRaw, color: number): void {
  const r = ((color >>> 24) & 255) / 255.0;
  const g = ((color >>> 16) & 255) / 255.0;
  const b = ((color >>> 8) & 255) / 255.0;
  const max = Math.max(Math.max(r, g), b);
  const min = Math.min(Math.min(r, g), b);
  const l = (max + min) / 2.0;
  if (max === min) {
    out.h = 0.0;
    out.s = 0.0;
    out.l = l;
    return;
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2.0 - max - min) : d / (max + min);
  let h;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6.0 : 0.0)) / 6.0;
  } else {
    if (max === g) {
      h = ((b - r) / d + 2.0) / 6.0;
    } else {
      h = ((r - g) / d + 4.0) / 6.0;
    }
  }
  out.h = h * 360.0;
  out.s = s;
  out.l = l;
}
