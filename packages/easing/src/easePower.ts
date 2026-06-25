import type { EasingFunction } from '@flighthq/types';

// Returns an InOut-Power easing function for an arbitrary exponent.
// The inflection point is always at (0.5, 0.5) — symmetric by construction.
// Allocates a closure; cache the result.
export function easeInOutPower(exponent: number): EasingFunction {
  return (t) => {
    if (t < 0.5) return Math.pow(t * 2, exponent) * 0.5;
    return 1 - Math.pow((1 - t) * 2, exponent) * 0.5;
  };
}

// Returns an In-Power easing function for an arbitrary exponent. This
// generalizes easeInQuadratic (exponent=2) through easeInQuintic (exponent=5)
// to any fractional or non-integer power, including sub-linear curves (0<exp<1).
// Allocates a closure; cache the result.
export function easeInPower(exponent: number): EasingFunction {
  return (t) => Math.pow(t, exponent);
}

// Returns an Out-Power easing function for an arbitrary exponent. Derived from
// easeInPower via the standard `1 - easeIn(1 - t)` reversal.
// Allocates a closure; cache the result.
export function easeOutPower(exponent: number): EasingFunction {
  return (t) => 1 - Math.pow(1 - t, exponent);
}
