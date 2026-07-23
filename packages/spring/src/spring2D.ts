import type { Spring2D, SpringConfig } from '@flighthq/types';

import { createSpring, isSpringSettled, updateSpring } from './spring';

// Allocate a 2D spring as a pair of scalar springs, each at its `value*` (default 0) and `velocity*`
// (default 0).
export function createSpring2D(
  valueX: number = 0,
  valueY: number = 0,
  velocityX: number = 0,
  velocityY: number = 0,
): Spring2D {
  return { x: createSpring(valueX, velocityX), y: createSpring(valueY, velocityY) };
}

// Report whether both axes of `spring2D` have settled at (`targetX`, `targetY`) — the per-component
// `isSpringSettled` on each axis, combined with AND. Epsilons apply to each axis independently.
export function isSpring2DSettled(
  spring2D: Readonly<Spring2D>,
  targetX: number,
  targetY: number,
  positionEpsilon?: number,
  velocityEpsilon?: number,
): boolean {
  return (
    isSpringSettled(spring2D.x, targetX, positionEpsilon, velocityEpsilon) &&
    isSpringSettled(spring2D.y, targetY, positionEpsilon, velocityEpsilon)
  );
}

// Advance both axes of `spring2D` one `deltaTime` step toward (`targetX`, `targetY`) under the same
// `config`, applying the scalar `updateSpring` per component. The axes are independent; sharing one
// config just gives them the same response.
export function updateSpring2D(
  spring2D: Spring2D,
  targetX: number,
  targetY: number,
  config: Readonly<SpringConfig>,
  deltaTime: number,
): void {
  updateSpring(spring2D.x, targetX, config, deltaTime);
  updateSpring(spring2D.y, targetY, config, deltaTime);
}
