import type { Spring3D, SpringConfig } from '@flighthq/types/contract';

import { applySpringImpulse, createSpring, isSpringSettled, resetSpring, updateSpring } from './spring';

// Add independent velocity impulses to all three axes without allocating or changing their values.
export function applySpringImpulse3D(
  spring3D: Spring3D,
  velocityX: number,
  velocityY: number,
  velocityZ: number,
): void {
  applySpringImpulse(spring3D.x, velocityX);
  applySpringImpulse(spring3D.y, velocityY);
  applySpringImpulse(spring3D.z, velocityZ);
}

// Allocate a 3D spring as three scalar springs, each at its `value*` (default 0) and `velocity*`
// (default 0).
export function createSpring3D(
  valueX: number = 0,
  valueY: number = 0,
  valueZ: number = 0,
  velocityX: number = 0,
  velocityY: number = 0,
  velocityZ: number = 0,
): Spring3D {
  return {
    x: createSpring(valueX, velocityX),
    y: createSpring(valueY, velocityY),
    z: createSpring(valueZ, velocityZ),
  };
}

// Report whether all three axes of `spring3D` have settled at (`targetX`, `targetY`, `targetZ`) —
// the per-component `isSpringSettled` on each axis, combined with AND.
export function isSpring3DSettled(
  spring3D: Readonly<Spring3D>,
  targetX: number,
  targetY: number,
  targetZ: number,
  positionEpsilon?: number,
  velocityEpsilon?: number,
): boolean {
  return (
    isSpringSettled(spring3D.x, targetX, positionEpsilon, velocityEpsilon) &&
    isSpringSettled(spring3D.y, targetY, positionEpsilon, velocityEpsilon) &&
    isSpringSettled(spring3D.z, targetZ, positionEpsilon, velocityEpsilon)
  );
}

// Snap all three axes to the supplied values and velocities. Velocities default independently to
// zero, mirroring `resetSpring` while preserving the vector spring's existing axis objects.
export function resetSpring3D(
  spring3D: Spring3D,
  valueX: number,
  valueY: number,
  valueZ: number,
  velocityX: number = 0,
  velocityY: number = 0,
  velocityZ: number = 0,
): void {
  resetSpring(spring3D.x, valueX, velocityX);
  resetSpring(spring3D.y, valueY, velocityY);
  resetSpring(spring3D.z, valueZ, velocityZ);
}

// Advance all three axes of `spring3D` one `deltaTime` step toward (`targetX`, `targetY`, `targetZ`)
// under the same `config`, applying the scalar `updateSpring` per component.
export function updateSpring3D(
  spring3D: Spring3D,
  targetX: number,
  targetY: number,
  targetZ: number,
  config: Readonly<SpringConfig>,
  deltaTime: number,
): void {
  updateSpring(spring3D.x, targetX, config, deltaTime);
  updateSpring(spring3D.y, targetY, config, deltaTime);
  updateSpring(spring3D.z, targetZ, config, deltaTime);
}
