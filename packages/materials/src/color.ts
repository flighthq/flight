import type { LinearColor } from '@flighthq/types';

export type { LinearColor };

// A hue/saturation/lightness color as three floats: hue in [0, 360), saturation and
// lightness in [0, 1]. Written by `rgbToHsl` and safe to keep as a reusable scratch out parameter.
export type HslColor = [number, number, number];

// A hue/saturation/value color as three floats: hue in [0, 360), saturation and
// value in [0, 1]. Written by `rgbToHsv` and safe to keep as a reusable scratch out parameter.
export type HsvColor = [number, number, number];

// Takes a 24-bit RGB color (`0xRRGGBB`, e.g. a TextFormat color) and returns a
// CSS `#RRGGBB` string. Any high-byte bits are masked off, so a 32-bit RGBA
// value would keep `GGBBAA` — pass RGB, not RGBA.
export function computeRgbHexString(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

// Allocates a fresh zeroed `HslColor` for use as an `rgbToHsl` out parameter.
export function createHslColor(): HslColor {
  return [0, 0, 0];
}

// Allocates a fresh zeroed `HsvColor` for use as an `rgbToHsv` out parameter.
export function createHsvColor(): HsvColor {
  return [0, 0, 0];
}

// Allocates a fresh zeroed `LinearColor` for use as an `unpackColorToLinear` out parameter.
export function createLinearColor(): LinearColor {
  return [0, 0, 0, 0];
}

// WCAG 2.x contrast ratio between two packed sRGB `0xRRGGBBAA` colors (alpha ignored).
// Returns the ratio in [1, 21]; 1 = no contrast, 21 = black on white. The formula is
// (L1 + 0.05) / (L2 + 0.05) where L1 ≥ L2 are the relative luminances.
export function getColorContrastRatio(a: number, b: number): number {
  const la = getColorLuminance(a);
  const lb = getColorLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// Rec. 709 relative luminance of a packed sRGB `0xRRGGBBAA` color (alpha ignored).
// Gamma-decodes RGB to linear, then applies the Rec. 709 luminance weights. Returns a
// value in [0, 1] where 0 is black and 1 is white.
export function getColorLuminance(color: number): number {
  const r = srgbChannelToLinear(((color >>> 24) & 0xff) / 0xff);
  const g = srgbChannelToLinear(((color >>> 16) & 0xff) / 0xff);
  const b = srgbChannelToLinear(((color >>> 8) & 0xff) / 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Converts a packed sRGB `0xRRGGBBAA` color to HSL. Writes `out[0]` = hue [0, 360),
// `out[1]` = saturation [0, 1], `out[2]` = lightness [0, 1]. Alpha is ignored.
// The conversion operates in sRGB (non-linear) space, matching artist-facing color pickers.
// Returns `out`.
export function hslToRgb(out: [number, number, number, number], h: number, s: number, l: number): void {
  // h in [0, 360), s and l in [0, 1]. Writes sRGB [0,1] R/G/B to out[0..2]; leaves out[3].
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

// Converts HSV to RGB floats. Writes sRGB [0,1] to out[0..2] (h in [0, 360), s/v in [0, 1]).
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

// Linearly interpolates between two packed sRGB colors `start` and `end` by `t` in [0, 1].
// Interpolation is performed in linear space for perceptual correctness (gamma-correct mix),
// then repacked to sRGB. Alpha is interpolated linearly (alpha is already linear coverage).
// `t` is clamped to [0, 1].
export function lerpColor(start: number, end: number, t: number): number {
  const tc = Math.min(1, Math.max(0, t));
  const sr = srgbChannelToLinear(((start >>> 24) & 0xff) / 0xff);
  const sg = srgbChannelToLinear(((start >>> 16) & 0xff) / 0xff);
  const sb = srgbChannelToLinear(((start >>> 8) & 0xff) / 0xff);
  const sa = (start & 0xff) / 0xff;
  const er = srgbChannelToLinear(((end >>> 24) & 0xff) / 0xff);
  const eg = srgbChannelToLinear(((end >>> 16) & 0xff) / 0xff);
  const eb = srgbChannelToLinear(((end >>> 8) & 0xff) / 0xff);
  const ea = (end & 0xff) / 0xff;
  const r = sr + (er - sr) * tc;
  const g = sg + (eg - sg) * tc;
  const b = sb + (eb - sb) * tc;
  const a = sa + (ea - sa) * tc;
  return packLinearToColor([r, g, b, a]);
}

// Linearly interpolates between two LinearColors in linear space and writes the result to
// `out`. `t` is clamped to [0, 1]. Alias-safe: reads all input values before writing `out`.
export function lerpLinearColor(
  out: LinearColor,
  start: Readonly<LinearColor>,
  end: Readonly<LinearColor>,
  t: number,
): LinearColor {
  const tc = Math.min(1, Math.max(0, t));
  const r0 = start[0];
  const g0 = start[1];
  const b0 = start[2];
  const a0 = start[3];
  const r1 = end[0];
  const g1 = end[1];
  const b1 = end[2];
  const a1 = end[3];
  out[0] = r0 + (r1 - r0) * tc;
  out[1] = g0 + (g1 - g0) * tc;
  out[2] = b0 + (b1 - b0) * tc;
  out[3] = a0 + (a1 - a0) * tc;
  return out;
}

// The IEC 61966-2-1 linear-to-sRGB inverse OETF for a single channel in [0, 1].
// Exported for callers that need per-channel conversion; the packed form is `packLinearToColor`.
export function linearChannelToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

// Packs four sRGB-space components (each in [0, 1]) to a `0xRRGGBBAA` integer.
// Does NOT gamma-encode — use `packLinearToColor` when starting from linear floats.
// Components are clamped to [0, 1] and rounded to 8-bit precision.
export function packColor(r: number, g: number, b: number, a: number): number {
  const ri = Math.round(Math.min(1, Math.max(0, r)) * 0xff);
  const gi = Math.round(Math.min(1, Math.max(0, g)) * 0xff);
  const bi = Math.round(Math.min(1, Math.max(0, b)) * 0xff);
  const ai = Math.round(Math.min(1, Math.max(0, a)) * 0xff);
  return ((ri << 24) | (gi << 16) | (bi << 8) | ai) >>> 0;
}

// Packs a linear-space RGBA float color to a `0xRRGGBBAA` integer (the inverse of
// `unpackColorToLinear`). RGB channels are gamma-encoded to sRGB; alpha passes through
// unchanged (alpha is linear coverage, never gamma-encoded). Channels are clamped to [0, 1].
export function packLinearToColor(color: Readonly<LinearColor>): number {
  const r = Math.round(Math.min(1, Math.max(0, linearChannelToSrgb(color[0]))) * 0xff);
  const g = Math.round(Math.min(1, Math.max(0, linearChannelToSrgb(color[1]))) * 0xff);
  const b = Math.round(Math.min(1, Math.max(0, linearChannelToSrgb(color[2]))) * 0xff);
  const a = Math.round(Math.min(1, Math.max(0, color[3])) * 0xff);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

// Premultiplies the RGB channels of a packed sRGB `0xRRGGBBAA` color by its alpha channel
// and returns a new packed color. Output RGB = round(RGB × alpha). The alpha channel
// is preserved unchanged. Fully-transparent (alpha=0) results in black-with-alpha-0.
// Used when a renderer requires premultiplied-alpha color values.
export function premultiplyColorAlpha(color: number): number {
  const a = (color & 0xff) / 0xff;
  const r = Math.round(((color >>> 24) & 0xff) * a);
  const g = Math.round(((color >>> 16) & 0xff) * a);
  const b = Math.round(((color >>> 8) & 0xff) * a);
  return ((r << 24) | (g << 16) | (b << 8) | (color & 0xff)) >>> 0;
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

// Converts a packed sRGB-space `0xRRGGBBAA` integer into four components in [0, 1] and
// writes them to `out`. Does NOT gamma-decode — use `unpackColorToLinear` for linear space.
export function unpackColorRgba(out: [number, number, number, number], color: number): void {
  out[0] = ((color >>> 24) & 0xff) / 0xff;
  out[1] = ((color >>> 16) & 0xff) / 0xff;
  out[2] = ((color >>> 8) & 0xff) / 0xff;
  out[3] = (color & 0xff) / 0xff;
}

// The single sRgb→linear decode seam for the whole SDK (§0.2): packed `0xRRGGBBAA` is
// sRgb-albedo, so RGB is gamma-decoded to linear while alpha passes through unchanged
// (alpha is already linear coverage, never gamma-encoded). Writes four floats in [0, 1]
// into `out` and returns it. A packed 8-bit integer cannot carry HDR — light and emissive
// radiance is `unpackColorToLinear(out, color) × intensity`, computed by the caller.
// Backends must not re-decode packed colors; they consume this output.
export function unpackColorToLinear(out: LinearColor, color: number): LinearColor {
  out[0] = srgbChannelToLinear(((color >>> 24) & 0xff) / 0xff);
  out[1] = srgbChannelToLinear(((color >>> 16) & 0xff) / 0xff);
  out[2] = srgbChannelToLinear(((color >>> 8) & 0xff) / 0xff);
  out[3] = (color & 0xff) / 0xff;
  return out;
}

// Reverses premultiplied-alpha encoding for a packed sRGB `0xRRGGBBAA` color.
// Output RGB = round(RGB / alpha), clamped to [0, 255]. Returns the input unchanged
// when alpha is 0 (division-by-zero guard: fully-transparent stays black-with-alpha-0).
export function unpremultiplyColorAlpha(color: number): number {
  const a = (color & 0xff) / 0xff;
  if (a === 0) return color;
  const r = Math.min(255, Math.round(((color >>> 24) & 0xff) / a));
  const g = Math.min(255, Math.round(((color >>> 16) & 0xff) / a));
  const b = Math.min(255, Math.round(((color >>> 8) & 0xff) / a));
  return ((r << 24) | (g << 16) | (b << 8) | (color & 0xff)) >>> 0;
}

// HSL helper: interpolates a single channel from hue position `t`.
function hueToRgbChannel(p: number, q: number, t: number): number {
  const tn = ((t % 1) + 1) % 1;
  if (tn < 1 / 6) return p + (q - p) * 6 * tn;
  if (tn < 1 / 2) return q;
  if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
  return p;
}

// The IEC 61966-2-1 sRgb electro-optical transfer function for a single channel in [0, 1].
function srgbChannelToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
