import { approxEqual, approxZero } from '@flighthq/math';
import type { Spring } from '@flighthq/types';

// Report whether `spring` has come to rest at `target`: its `value` is within `positionEpsilon` of
// the target AND its `velocity` is within `velocityEpsilon` of zero. Both conditions are required —
// a spring passing through the target at speed (an underdamped overshoot) is not settled.
//
// Settle is a property of position and velocity alone, independent of the `SpringConfig` that drove
// the motion, so no config is taken. Epsilons default to a UI-scale tolerance; pass tighter or
// looser values for the value's actual units.
export function isSpringSettled(
  spring: Readonly<Spring>,
  target: number,
  positionEpsilon: number = SPRING_SETTLE_EPSILON,
  velocityEpsilon: number = SPRING_SETTLE_EPSILON,
): boolean {
  return approxEqual(spring.value, target, positionEpsilon) && approxZero(spring.velocity, velocityEpsilon);
}

// Default position/velocity tolerance for settle detection: fine enough that motion has visually
// stopped for typical pixel/normalized values, loose enough not to wait on floating-point tails.
const SPRING_SETTLE_EPSILON = 1e-3;
