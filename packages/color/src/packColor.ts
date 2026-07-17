import type { LinearColor } from '@flighthq/types';

import { linearChannelToSrgb, srgbChannelToLinear } from './srgbTransfer';

export type { LinearColor };

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
