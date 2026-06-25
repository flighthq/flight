import type { EasingFunction } from '@flighthq/types';

// Returns the numerical derivative (instantaneous velocity) of `ease` at the
// given `t` using a centered finite-difference approximation:
//   (ease(t + epsilon) - ease(t - epsilon)) / (2 * epsilon)
//
// This is the slope of the easing curve at `t`, useful for handing off
// velocity when transitioning between animations (e.g. from a finishing tween
// to a starting spring). The endpoint boundary is handled by clamping: at
// `t ≤ epsilon` a forward difference is used; at `t ≥ 1 - epsilon` a backward
// difference is used.
//
// `epsilon` defaults to 1e-6. Pass a smaller value for smoother curves or a
// larger one for noisy/discretized curves. The function never throws.
export function getEasingDerivative(ease: EasingFunction, t: number, epsilon: number = defaultEpsilon): number {
  if (t <= epsilon) {
    // Forward difference at the left boundary.
    return (ease(epsilon * 2) - ease(0)) / (epsilon * 2);
  }
  if (t >= 1 - epsilon) {
    // Backward difference at the right boundary.
    return (ease(1) - ease(1 - epsilon * 2)) / (epsilon * 2);
  }
  // Central difference in the interior.
  return (ease(t + epsilon) - ease(t - epsilon)) / (2 * epsilon);
}

// Default step size for numerical differentiation. Small enough for smooth
// curves but large enough to avoid cancellation errors in Float64.
const defaultEpsilon = 1e-6;
