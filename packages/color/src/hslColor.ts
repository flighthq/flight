// A hue/saturation/lightness color as three floats: hue in [0, 360), saturation and
// lightness in [0, 1]. Written by `rgbToHsl` and safe to keep as a reusable scratch out parameter.
export type HslColor = [number, number, number];

// Allocates a fresh zeroed `HslColor` for use as an `rgbToHsl` out parameter.
export function createHslColor(): HslColor {
  return [0, 0, 0];
}

// Converts HSL to sRGB floats. Writes sRGB [0, 1] R/G/B to out[0..2] (h in [0, 360), s/l in
// [0, 1]); leaves out[3] (alpha) unmodified. The conversion operates in sRGB (non-linear)
// space, matching artist-facing color pickers.
export function hslToRgb(out: [number, number, number, number], h: number, s: number, l: number): void {
  if (s === 0) {
    out[0] = l;
    out[1] = l;
    out[2] = l;
    return;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;
  out[0] = hueToRgbChannel(p, q, hn + 1 / 3);
  out[1] = hueToRgbChannel(p, q, hn);
  out[2] = hueToRgbChannel(p, q, hn - 1 / 3);
}

// Converts a packed sRGB `0xRRGGBBAA` color to HSL and writes to `out`.
// `out[0]` = hue in [0, 360), `out[1]` = saturation [0, 1], `out[2]` = lightness [0, 1].
// Alpha is ignored. The conversion operates in sRGB (non-linear) space, consistent with
// artist-facing HSL color pickers. Returns `out`.
export function rgbToHsl(out: HslColor, color: number): HslColor {
  const r = ((color >>> 24) & 0xff) / 0xff;
  const g = ((color >>> 16) & 0xff) / 0xff;
  const b = ((color >>> 8) & 0xff) / 0xff;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    out[0] = 0;
    out[1] = 0;
    out[2] = l;
    return out;
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }
  out[0] = h * 360;
  out[1] = s;
  out[2] = l;
  return out;
}

// HSL helper: interpolates a single channel from hue position `t`.
function hueToRgbChannel(p: number, q: number, t: number): number {
  const tn = ((t % 1) + 1) % 1;
  if (tn < 1 / 6) return p + (q - p) * 6 * tn;
  if (tn < 1 / 2) return q;
  if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
  return p;
}
