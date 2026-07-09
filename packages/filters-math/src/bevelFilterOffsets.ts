import type { BevelFilterOffsets } from '@flighthq/types';

/**
 * Computes the mirrored highlight/shadow offset pair a bevel samples along `angleRadians` at
 * `distance` pixels, writing into `out`. The highlight offset is `(cos·distance, sin·distance)`
 * rounded to whole pixels; the shadow offset is its exact negation.
 *
 * Rounding is applied to the highlight components and then negated for the shadow
 * (round-before-negate), rather than rounding each side independently. `Math.round` breaks ties
 * toward +∞, so `round(-x) !== -round(x)` at half-pixel values (e.g. `round(2.5) = 3` but
 * `round(-2.5) = -2`); rounding once and negating keeps the two beveled edges exactly opposite,
 * which independent rounding would skew by a pixel. `angleRadians` follows the SDK convention: 0
 * points right, increasing clockwise in screen space. Returns `out`.
 */
export function getBevelFilterOffsets(
  distance: number,
  angleRadians: number,
  out: BevelFilterOffsets,
): BevelFilterOffsets {
  const dx = Math.round(Math.cos(angleRadians) * distance);
  const dy = Math.round(Math.sin(angleRadians) * distance);
  out.dx = dx;
  out.dy = dy;
  // Negate via `0 - v` rather than `-v` so a zero component negates to +0, not -0.
  out.negDx = 0 - dx;
  out.negDy = 0 - dy;
  return out;
}
