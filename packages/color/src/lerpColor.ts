// Generated from crates/flight-color/src/lerp_color.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { LinearColorRaw } from './packColor.ts';
import { packLinearChannelsToColor } from './packColor.ts';
import { srgbChannelToLinear } from './srgbTransfer.ts';

/**
 * Linearly interpolates between two packed sRGB colors `start` and `end` by `t` in [0, 1].
 * Interpolation is performed in linear space for perceptual correctness (gamma-correct mix),
 * then repacked to sRGB. Alpha is interpolated linearly (alpha is already linear coverage).
 * `t` is clamped to [0, 1].
 */
export function lerpColor(start: number, end: number, t: number): number {
  const tc = Math.min(Math.max(t, 0.0), 1.0);
  const sr = srgbChannelToLinear(((start >>> 24) & 255) / 255.0);
  const sg = srgbChannelToLinear(((start >>> 16) & 255) / 255.0);
  const sb = srgbChannelToLinear(((start >>> 8) & 255) / 255.0);
  const sa = (start & 255) / 255.0;
  const er = srgbChannelToLinear(((end >>> 24) & 255) / 255.0);
  const eg = srgbChannelToLinear(((end >>> 16) & 255) / 255.0);
  const eb = srgbChannelToLinear(((end >>> 8) & 255) / 255.0);
  const ea = (end & 255) / 255.0;
  const r = sr + (er - sr) * tc;
  const g = sg + (eg - sg) * tc;
  const b = sb + (eb - sb) * tc;
  const a = sa + (ea - sa) * tc;
  return packLinearChannelsToColor(r, g, b, a) >>> 0;
}

/**
 * Linearly interpolates between two LinearColors in linear space and writes the result to
 * `out`. `t` is clamped to [0, 1]. Alias-safe: reads all input values before writing `out`.
 */
export function lerpLinearColor(
  out: LinearColorRaw,
  start: Readonly<LinearColorRaw>,
  end: Readonly<LinearColorRaw>,
  t: number,
): void {
  const tc = Math.min(Math.max(t, 0.0), 1.0);
  const r0 = start.r;
  const g0 = start.g;
  const b0 = start.b;
  const a0 = start.a;
  const r1 = end.r;
  const g1 = end.g;
  const b1 = end.b;
  const a1 = end.a;
  out.r = r0 + (r1 - r0) * tc;
  out.g = g0 + (g1 - g0) * tc;
  out.b = b0 + (b1 - b0) * tc;
  out.a = a0 + (a1 - a0) * tc;
}
