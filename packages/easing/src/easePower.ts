// Generated from crates/flight-easing/src/ease_power.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EasingFunction } from './easingTypes.ts';

/**
 * Returns an InOut-Power easing function for an arbitrary exponent.
 * The inflection point is always at (0.5, 0.5).
 */
export function easeInOutPower(exponent: number): EasingFunction {
  return (t: number): number => {
    if (t < 0.5) {
      return Math.pow(t * 2.0, exponent) * 0.5;
    }
    return 1.0 - Math.pow((1.0 - t) * 2.0, exponent) * 0.5;
  };
}

/**
 * Returns an In-Power easing function for an arbitrary exponent.
 */
export function easeInPower(exponent: number): EasingFunction {
  return (t: number): number => {
    return Math.pow(t, exponent);
  };
}

/**
 * Returns an Out-Power easing function for an arbitrary exponent.
 */
export function easeOutPower(exponent: number): EasingFunction {
  return (t: number): number => {
    return 1.0 - Math.pow(1.0 - t, exponent);
  };
}
