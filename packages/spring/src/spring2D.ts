import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Spring2D, SpringConfig, EntityConstruction } from '@flighthq/types/contract';

import { applySpringImpulse, createSpring, isSpringSettled, resetSpring, updateSpring } from './spring';

// Add independent velocity impulses to both axes without allocating or changing either value.
export function applySpringImpulse2D(spring2D: Spring2D, velocityX: number, velocityY: number): void {
  applySpringImpulse(spring2D.x, velocityX);
  applySpringImpulse(spring2D.y, velocityY);
}

export function createSpring2D(
  valueX: number = 0,
  valueY: number = 0,
  velocityX: number = 0,
  velocityY: number = 0,
): Spring2D {
  const out = allocateEntity<Spring2D>();
  initializeSpring2D(out, valueX, valueY, velocityX, velocityY);
  return finishEntity(out);
}

// Allocate a 2D spring as a pair of scalar springs, each at its `value*` (default 0) and `velocity*`
// (default 0).
export function initializeSpring2D(
  out: EntityConstruction<Spring2D>,
  valueX: number = 0,
  valueY: number = 0,
  velocityX: number = 0,
  velocityY: number = 0,
): void {
  out.x = createSpring(valueX, velocityX);
  out.y = createSpring(valueY, velocityY);
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

// Snap both axes to the supplied values and velocities. Velocities default independently to zero,
// mirroring `resetSpring` while preserving the vector spring's existing axis objects.
export function resetSpring2D(
  spring2D: Spring2D,
  valueX: number,
  valueY: number,
  velocityX: number = 0,
  velocityY: number = 0,
): void {
  resetSpring(spring2D.x, valueX, velocityX);
  resetSpring(spring2D.y, valueY, velocityY);
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
