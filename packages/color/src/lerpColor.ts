import type { LinearColor } from '@flighthq/types';

import { packLinearToColor } from './packColor';
import { srgbChannelToLinear } from './srgbTransfer';

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
