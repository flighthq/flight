import type { EasingFunction } from '@flighthq/types';

// Easing combinators: each function takes one or more EasingFunctions and
// returns a new EasingFunction. These allocate a closure — treat them as
// create*-style calls and cache the result rather than calling inside tight
// loops. All combinators are alias-safe: they read all inputs before writing.
// EasingFunction parameters are function values, which are immutable by nature
// (function references cannot be mutated via the parameter), so Readonly<> is
// not needed on the callable type itself.

// Returns a new easing function that clamps `t` to [0,1] before delegating to
// `ease`. Use this to guard any easing function when the input may be driven
// from an unclamped source (physics integrator, spring, scroll offset).
// All other easing combinators and fixed-curve constants assume `t` is
// pre-clamped — this wrapper is the opt-in clamping layer.
export function easeClamp(ease: EasingFunction): EasingFunction {
  return (t) => ease(t < 0 ? 0 : t > 1 ? 1 : t);
}

// Returns a new easing function that clamps the output of `ease` to [min, max].
// Useful when an overshoot curve (easeInBack, easeOutElastic, etc.) drives a
// downstream consumer that requires a strict value range.
export function easeClampOutput(ease: EasingFunction, min: number, max: number): EasingFunction {
  return (t) => {
    const v = ease(t);
    return v < min ? min : v > max ? max : v;
  };
}

// Returns a new easing function that is the vertical mirror of `ease`:
// `t => 1 - ease(t)`. Maps f(0)=0,f(1)=1 curves to f(0)=1,f(1)=0.
// Distinct from easeReverse — this flips the output axis, not the input axis.
export function easeInvert(ease: EasingFunction): EasingFunction {
  return (t) => 1 - ease(t);
}

// Derives an InOut curve from an In curve using the standard half-and-mirror
// splice: the first half maps `[0,0.5]` via the In curve, and the second half
// mirrors that across the diagonal. The resulting curve passes through (0,0),
// (0.5,0.5), and (1,1).
export function easeMirror(easeIn: EasingFunction): EasingFunction {
  return (t) => {
    if (t < 0.5) return easeIn(t * 2) * 0.5;
    return 1 - easeIn((1 - t) * 2) * 0.5;
  };
}

// Derives an Out curve from an In curve: `t => 1 - easeIn(1 - t)`. The result
// has easeIn's slow start mapped to a slow finish and vice-versa.
export function easeReverse(easeIn: EasingFunction): EasingFunction {
  return (t) => 1 - easeIn(1 - t);
}

// Remaps the output of `ease` from [0,1] to [fromValue, toValue]. Useful for
// directly driving a property value without a separate lerp call:
// `easeScaleOutput(ease, 100, 300)` produces values in [100,300].
export function easeScaleOutput(ease: EasingFunction, fromValue: number, toValue: number): EasingFunction {
  return (t) => fromValue + ease(t) * (toValue - fromValue);
}
