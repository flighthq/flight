import type { HsvColor } from '@flighthq/types';

// Allocates a fresh zeroed `HsvColor` for use as an `rgbToHsv` out parameter.
export function allocateHsvColor(): HsvColor {
  return [0, 0, 0];
}

// Converts HSV to RGB floats. Writes sRGB [0, 1] to out[0..2] (h in [0, 360), s/v in [0, 1]).
// Alpha in out[3] is not modified.
export function hsvToRgb(out: [number, number, number, number], h: number, s: number, v: number): void {
  if (s === 0) {
    out[0] = v;
    out[1] = v;
    out[2] = v;
    return;
  }
  const hn = ((h % 360) + 360) % 360;
  const i = Math.floor(hn / 60) % 6;
  const f = hn / 60 - Math.floor(hn / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
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

// Converts a packed sRGB `0xRRGGBBAA` color to HSV and writes to `out`.
// `out[0]` = hue in [0, 360), `out[1]` = saturation [0, 1], `out[2]` = value [0, 1].
// Alpha is ignored. The conversion operates in sRGB (non-linear) space. Returns `out`.
export function rgbToHsv(out: HsvColor, color: number): HsvColor {
  const r = ((color >>> 24) & 0xff) / 0xff;
  const g = ((color >>> 16) & 0xff) / 0xff;
  const b = ((color >>> 8) & 0xff) / 0xff;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h;
  if (d === 0) {
    h = 0;
  } else if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }
  out[0] = h * 360;
  out[1] = s;
  out[2] = v;
  return out;
}
