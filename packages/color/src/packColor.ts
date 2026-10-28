// Generated from crates/flight-color/src/pack_color.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityRaw } from '@flighthq/entity/contract';

import { linearChannelToSrgb, srgbChannelToLinear } from './srgbTransfer.ts';

export interface LinearColorRaw extends EntityRaw {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Allocates a fresh zeroed `LinearColor` for use as an `unpackColorToLinear` out parameter.
 */
export function allocateLinearColor(): LinearColorRaw {
  return Object.assign(allocateEntity<LinearColorRaw>(), { a: 0, b: 0, g: 0, r: 0 });
}

/**
 * Takes Flight's packed sRGB `0xRRGGBBAA` color and returns a CSS `rgba()` string. Alpha stays a
 * linear coverage value, matching Canvas/CSS compositing rather than going through sRGB transfer.
 */
export function computeRgbaCssString(color: number): string {
  const packed = color;
  const red = (packed >> 24) & 0xff;
  const green = (packed >> 16) & 0xff;
  const blue = (packed >> 8) & 0xff;
  const alpha = (packed & 0xff) / 255.0;
  return `rgba(${red},${green},${blue},${alpha})`;
}

/**
 * Takes a 24-bit RGB color (`0xRRGGBB`, e.g. a shape authoring color) and returns a CSS `#RRGGBB`
 * string. Any high-byte bits are masked off, so a 32-bit RGBA value would keep `GGBBAA` -- every
 * channel shifted, and still a valid-looking color. For a packed `0xRRGGBBAA` value use
 * `computeRgbaCssString`, which carries the alpha, or `getColorRgb` to drop it first.
 */
export function computeRgbHexString(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/**
 * Returns the alpha channel of a packed `0xRRGGBBAA` color as a float in [0, 1] -- the inverse of
 * `setColorAlpha`. RGB is ignored. Alpha is linear coverage, so this is a plain byte read with no
 * gamma decode (unlike `unpackColorToLinear`, which decodes the RGB channels).
 */
export function getColorAlpha(color: number): number {
  return (color & 0xff) / 255.0;
}

/**
 * Returns the 24-bit RGB part (`0xRRGGBB`) of a packed `0xRRGGBBAA` color, dropping alpha -- the
 * inverse of `packOpaqueColor`'s widening. Useful when handing a color to an API that wants the
 * alpha-less form (a CSS `#RRGGBB` via `computeRgbHexString`, a 24-bit format field).
 */
export function getColorRgb(color: number): number {
  return ((color >>> 8) & 0xffffff) >>> 0;
}

/**
 * Packs four sRGB-space components (each in [0, 1]) to a `0xRRGGBBAA` integer.
 * Does NOT gamma-encode -- use `packLinearToColor` when starting from linear floats.
 * Components are clamped to [0, 1] and rounded to 8-bit precision.
 */
export function packColor(r: number, g: number, b: number, a: number): number {
  const ri = Math.round(Math.min(Math.max(r, 0.0), 1.0) * 255.0) >>> 0;
  const gi = Math.round(Math.min(Math.max(g, 0.0), 1.0) * 255.0) >>> 0;
  const bi = Math.round(Math.min(Math.max(b, 0.0), 1.0) * 255.0) >>> 0;
  const ai = Math.round(Math.min(Math.max(a, 0.0), 1.0) * 255.0) >>> 0;
  return ((ri << 24) | (gi << 16) | (bi << 8) | ai) >>> 0;
}

/**
 * Packs scalar linear-space RGBA channels to a `0xRRGGBBAA` integer without allocating a
 * `LinearColor` entity. RGB channels are gamma-encoded to sRGB; alpha passes through unchanged.
 */
export function packLinearChannelsToColor(r: number, g: number, b: number, a: number): number {
  const ri = Math.round(Math.min(Math.max(linearChannelToSrgb(r), 0.0), 1.0) * 255.0) >>> 0;
  const gi = Math.round(Math.min(Math.max(linearChannelToSrgb(g), 0.0), 1.0) * 255.0) >>> 0;
  const bi = Math.round(Math.min(Math.max(linearChannelToSrgb(b), 0.0), 1.0) * 255.0) >>> 0;
  const ai = Math.round(Math.min(Math.max(a, 0.0), 1.0) * 255.0) >>> 0;
  return ((ri << 24) | (gi << 16) | (bi << 8) | ai) >>> 0;
}

/**
 * Packs a linear-space RGBA float color to a `0xRRGGBBAA` integer (the inverse of
 * `unpackColorToLinear`). RGB channels are gamma-encoded to sRGB; alpha passes through
 * unchanged (alpha is linear coverage, never gamma-encoded). Channels are clamped to [0, 1].
 */
export function packLinearToColor(color: Readonly<LinearColorRaw>): number {
  return packLinearChannelsToColor(color.r, color.g, color.b, color.a) >>> 0;
}

/**
 * Widens a 24-bit RGB color (`0xRRGGBB` -- a CSS hex literal, a Flash/AwayJS source color, a
 * 24-bit format field) to a fully opaque packed `0xRRGGBBAA` integer, Flight's canonical color form.
 * Bits above 24 are masked off, so `packOpaqueColor(0xff8800)` is `0xff8800ff`. The complement of
 * `getColorRgb`; use `setColorAlpha` afterward for a non-opaque alpha.
 */
export function packOpaqueColor(rgb: number): number {
  return (((rgb & 0xffffff) << 8) | 0xff) >>> 0;
}

/**
 * Replaces the alpha channel of a packed `0xRRGGBBAA` color with `alpha` (a float in [0, 1], clamped
 * and rounded to 8 bits), leaving RGB untouched -- the inverse of `getColorAlpha`. Use to fade or set
 * the opacity of a fixed color without unpacking it.
 */
export function setColorAlpha(color: number, alpha: number): number {
  const a = Math.round(Math.min(Math.max(alpha, 0.0), 1.0) * 255.0) >>> 0;
  return ((color & 0xffffff00) | a) >>> 0;
}

/**
 * Converts a packed sRGB-space `0xRRGGBBAA` integer into four components in [0, 1] and
 * writes them to `out`. Does NOT gamma-decode -- use `unpackColorToLinear` for linear space.
 */
export function unpackColorRgba(out: Float32Array, color: number): void {
  out[0] = ((color >>> 24) & 0xff) / 255.0;
  out[1] = ((color >>> 16) & 0xff) / 255.0;
  out[2] = ((color >>> 8) & 0xff) / 255.0;
  out[3] = (color & 0xff) / 255.0;
}

/**
 * The single sRGB-to-linear decode seam for the whole SDK: packed `0xRRGGBBAA` is
 * sRGB-albedo, so RGB is gamma-decoded to linear while alpha passes through unchanged
 * (alpha is already linear coverage, never gamma-encoded). Writes four floats in [0, 1]
 * into `out`. A packed 8-bit integer cannot carry HDR -- light and emissive
 * radiance is `unpackColorToLinear(out, color) * intensity`, computed by the caller.
 * Backends must not re-decode packed colors; they consume this output.
 */
export function unpackColorToLinear(out: LinearColorRaw, color: number): void {
  out.r = srgbChannelToLinear(((color >>> 24) & 0xff) / 255.0);
  out.g = srgbChannelToLinear(((color >>> 16) & 0xff) / 255.0);
  out.b = srgbChannelToLinear(((color >>> 8) & 0xff) / 255.0);
  out.a = (color & 0xff) / 255.0;
}
