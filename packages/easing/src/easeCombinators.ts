// Generated from crates/flight-easing/src/ease_combinators.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EasingFunction } from './easingTypes.ts';

/**
 * Returns a new easing function that clamps `t` to [0,1] before delegating to `ease`.
 */
export function easeClamp(ease: EasingFunction): EasingFunction {
  return (t: number): number => {
    const clamped = t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t;
    return ease(clamped);
  };
}

/**
 * Returns a new easing function that clamps the output of `ease` to [min, max].
 */
export function easeClampOutput(ease: EasingFunction, min: number, max: number): EasingFunction {
  return (t: number): number => {
    const v = ease(t);
    return v < min ? min : v > max ? max : v;
  };
}

/**
 * Returns a new easing function that is the vertical mirror of `ease`:
 * `t => 1 - ease(t)`. Maps f(0)=0,f(1)=1 curves to f(0)=1,f(1)=0.
 */
export function easeInvert(ease: EasingFunction): EasingFunction {
  return (t: number): number => {
    return 1.0 - ease(t);
  };
}

/**
 * Derives an InOut curve from an In curve using the standard half-and-mirror
 * splice: the first half maps `[0,0.5]` via the In curve, and the second half
 * mirrors that across the diagonal.
 */
export function easeMirror(easeIn: EasingFunction): EasingFunction {
  return (t: number): number => {
    if (t < 0.5) {
      return easeIn(t * 2.0) * 0.5;
    }
    return 1.0 - easeIn((1.0 - t) * 2.0) * 0.5;
  };
}

/**
 * Derives an Out curve from an In curve: `t => 1 - easeIn(1 - t)`.
 */
export function easeReverse(easeIn: EasingFunction): EasingFunction {
  return (t: number): number => {
    return 1.0 - easeIn(1.0 - t);
  };
}

/**
 * Remaps the output of `ease` from [0,1] to [from_value, to_value].
 */
export function easeScaleOutput(ease: EasingFunction, fromValue: number, toValue: number): EasingFunction {
  return (t: number): number => {
    return fromValue + ease(t) * (toValue - fromValue);
  };
}
