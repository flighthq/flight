// A linear-space RGBA color as four floats in [0, 1] (RGB) / [0, 1] (A). The single
// float representation downstream lighting and shading math consumes. Written by
// `unpackColorToLinear` and safe to keep as a reusable scratch out parameter.
export type LinearColor = [number, number, number, number];

// Takes a 24-bit RGB color (`0xRRGGBB`, e.g. a TextFormat color) and returns a
// CSS `#RRGGBB` string. Any high-byte bits are masked off, so a 32-bit RGBA
// value would keep `GGBBAA` — pass RGB, not RGBA.
export function computeRgbHexString(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

// Allocates a fresh zeroed `LinearColor` for use as an `unpackColorToLinear` out parameter.
export function createLinearColor(): LinearColor {
  return [0, 0, 0, 0];
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

// The IEC 61966-2-1 sRgb electro-optical transfer function for a single channel in [0, 1].
function srgbChannelToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
