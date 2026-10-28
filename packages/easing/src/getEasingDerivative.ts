// Generated from crates/flight-easing/src/get_easing_derivative.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EasingFunction } from './easingTypes.ts';

/**
 * Default step size for numerical differentiation.
 *
 * For f32 numerical differentiation, the optimal step balances truncation
 * error O(h^2) against roundoff O(machine_eps / h). With f32 machine epsilon
 * ~1.19e-7, a step of 1e-3 is a good default.
 */
export const DEFAULT_EASING_DERIVATIVE_EPSILON: number = 1e-3;

/**
 * Returns the numerical derivative (instantaneous velocity) of `ease` at the
 * given `t` using a centered finite-difference approximation. The endpoint
 * boundary is handled by clamping: at `t <= epsilon` a forward difference is
 * used; at `t >= 1 - epsilon` a backward difference is used. A missing
 * `epsilon` defaults to `DEFAULT_EASING_DERIVATIVE_EPSILON`.
 */
export function getEasingDerivative(ease: EasingFunction, t: number, epsilon?: number): number {
  epsilon = epsilon ?? DEFAULT_EASING_DERIVATIVE_EPSILON;
  if (t <= epsilon) {
    return (ease(epsilon * 2.0) - ease(0.0)) / (epsilon * 2.0);
  }
  if (t >= 1.0 - epsilon) {
    return (ease(1.0) - ease(1.0 - epsilon * 2.0)) / (epsilon * 2.0);
  }
  return (ease(t + epsilon) - ease(t - epsilon)) / (2.0 * epsilon);
}
