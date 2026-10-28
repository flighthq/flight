// Generated from crates/flight-color/src/hsv_color_raw.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityRaw } from '@flighthq/entity/contract';

export interface HsvColorRaw extends EntityRaw {
  h: number;
  s: number;
  v: number;
}

/**
 * Allocates a fresh zeroed `HsvColor` for use as an `rgbToHsv` out parameter.
 */
export function allocateHsvColor(): HsvColorRaw {
  return Object.assign(allocateEntity<HsvColorRaw>(), { h: 0, s: 0, v: 0 });
}

/**
 * Converts HSV to RGB floats. Writes sRGB [0, 1] to out[0..2] (h in [0, 360), s/v in [0, 1]).
 * Alpha in out[3] is not modified.
 */
export function hsvToRgb(out: Float32Array, h: number, s: number, v: number): void {
  if (s === 0.0) {
    out[0] = v;
    out[1] = v;
    out[2] = v;
    return;
  }
  const hn = ((h % 360.0) + 360.0) % 360.0;
  const i = (Math.floor(hn / 60.0) | 0) % 6;
  const f = hn / 60.0 - Math.floor(hn / 60.0);
  const p = v * (1.0 - s);
  const q = v * (1.0 - f * s);
  const t = v * (1.0 - (1.0 - f) * s);
  switch (i) {
    case 0:
      out[0] = v;
      out[1] = t;
      out[2] = p;
      break;
    case 1:
      out[0] = q;
      out[1] = v;
      out[2] = p;
      break;
    case 2:
      out[0] = p;
      out[1] = v;
      out[2] = t;
      break;
    case 3:
      out[0] = p;
      out[1] = q;
      out[2] = v;
      break;
    case 4:
      out[0] = t;
      out[1] = p;
      out[2] = v;
      break;
    default:
      out[0] = v;
      out[1] = p;
      out[2] = q;
      break;
  }
}

/**
 * Converts a packed sRGB `0xRRGGBBAA` color to HSV and writes to `out`.
 * `out.h` = hue in [0, 360), `out.s` = saturation [0, 1], `out.v` = value [0, 1].
 * Alpha is ignored. The conversion operates in sRGB (non-linear) space.
 */
export function rgbToHsv(out: HsvColorRaw, color: number): void {
  const r = ((color >>> 24) & 255) / 255.0;
  const g = ((color >>> 16) & 255) / 255.0;
  const b = ((color >>> 8) & 255) / 255.0;
  const max = Math.max(Math.max(r, g), b);
  const min = Math.min(Math.min(r, g), b);
  const d = max - min;
  const v = max;
  const s = max === 0.0 ? 0.0 : d / max;
  let h;
  if (d === 0.0) {
    h = 0.0;
  } else {
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6.0 : 0.0)) / 6.0;
    } else {
      if (max === g) {
        h = ((b - r) / d + 2.0) / 6.0;
      } else {
        h = ((r - g) / d + 4.0) / 6.0;
      }
    }
  }
  out.h = h * 360.0;
  out.s = s;
  out.v = v;
}
