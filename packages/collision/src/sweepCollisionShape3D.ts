import type { CollisionShape3D, CollisionTimeOfImpact3D } from '@flighthq/types/contract';

import { getCollisionSupport3D } from './collisionSupport3D';
import { createCollisionDistance3D, writeCollisionDistance3D } from './gjkDistance3D';

export function createCollisionTimeOfImpact3D(): CollisionTimeOfImpact3D {
  return { fraction: 0, x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 };
}

// Finds the first moment two convex shapes touch under LINEAR TRANSLATION of both, as a fraction of the
// swept interval. Returns false when they never touch within it, or when either kind has no registered
// support.
//
// CONSERVATIVE ADVANCEMENT, not sampling. At each step it measures the current gap and the speed the pair
// is closing it at, then advances by exactly the time that gap would take to close — a quantity that
// cannot overshoot, because no part of either shape can approach faster than the closing speed along the
// separating axis. Repeating narrows onto the true first contact from below.
//
// The alternative — testing overlap at N evenly spaced fractions — is what this exists to avoid. A bullet
// crossing a thin wall is separated at every sample and overlapping at none, so sampling reports a clean
// miss precisely in the case continuous collision was added for. Advancement cannot skip the wall, because
// the wall being close is what makes the step small.
export function sweepCollisionShape3D(
  shapeA: Readonly<CollisionShape3D>,
  translationAX: number,
  translationAY: number,
  translationAZ: number,
  shapeB: Readonly<CollisionShape3D>,
  translationBX: number,
  translationBY: number,
  translationBZ: number,
  out: CollisionTimeOfImpact3D,
  maxFraction = 1,
): boolean {
  clearCollisionTimeOfImpact3D(out);
  if (
    !Number.isFinite(translationAX) ||
    !Number.isFinite(translationAY) ||
    !Number.isFinite(translationAZ) ||
    !Number.isFinite(translationBX) ||
    !Number.isFinite(translationBY) ||
    !Number.isFinite(translationBZ) ||
    !Number.isFinite(maxFraction) ||
    maxFraction < 0
  ) {
    return false;
  }

  // Only the RELATIVE motion matters: the pair's separation depends on where the shapes are with respect
  // to each other, so one shape may be treated as fixed and the other as carrying the difference.
  const relativeX = translationAX - translationBX;
  const relativeY = translationAY - translationBY;
  const relativeZ = translationAZ - translationBZ;
  // A's OWN translation, which is what converts a witness on A back into world space. The relative
  // vector is what the distance query is posed in, and using it here moves a static shape's contact
  // point by the other shape's motion — a wall's corner reported five units from the wall.
  translationA[0] = translationAX;
  translationA[1] = translationAY;
  translationA[2] = translationAZ;

  // The last direction the pair was measurably APART along. It has to be carried rather than read at the
  // end, because the final measurement is the one that reports contact — and a query with no gap has no
  // axis, so it clears the direction on its way out. Reading it there yields a zero normal with a
  // perfectly correct fraction, which is worse than either being wrong alone: the impact looks found.
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  let fraction = 0;

  for (let iteration = 0; iteration < MAX_SWEEP_ITERATIONS; iteration += 1) {
    const separated = writeCollisionDistance3D(
      shapeA,
      shapeB,
      scratchDistance,
      relativeX * fraction,
      relativeY * fraction,
      relativeZ * fraction,
    );
    if (!separated) {
      // Already touching or overlapping at this fraction. At fraction 0 that is a pair that started in
      // contact, which is a legitimate answer rather than a failure — and the one case with no preceding
      // measurement, so its normal stays zero the way a raycast from inside a shape reports none.
      if (!scratchDistance.overlapping) return false;
      return writeTimeOfImpact3D(out, shapeA, translationA, fraction, normalX, normalY, normalZ);
    }

    normalX = scratchDistance.directionX;
    normalY = scratchDistance.directionY;
    normalZ = scratchDistance.directionZ;
    if (scratchDistance.distance <= SWEEP_TOUCH_TOLERANCE) {
      return writeTimeOfImpact3D(out, shapeA, translationA, fraction, normalX, normalY, normalZ);
    }

    // The rate the gap closes, along the axis it is measured on. The direction points from B toward A, so
    // A moving TOWARD B projects negative onto it and closes the gap.
    const closingSpeed = -(relativeX * normalX + relativeY * normalY + relativeZ * normalZ);
    // Parting, or sliding parallel: no advance would ever bring them together along this axis.
    if (closingSpeed <= 0) return false;

    fraction += scratchDistance.distance / closingSpeed;
    if (fraction > maxFraction) return false;
  }

  // The advancement did not converge within its budget, which happens when a pair grazes almost
  // tangentially and each step buys very little. Reporting no impact is the safe answer: it degrades to
  // the discrete behaviour rather than inventing a contact at an unconverged fraction.
  return false;
}

function clearCollisionTimeOfImpact3D(out: CollisionTimeOfImpact3D): void {
  out.fraction = 0;
  out.x = 0;
  out.y = 0;
  out.z = 0;
  out.normalX = 0;
  out.normalY = 0;
  out.normalZ = 0;
}

// Writes the converged fraction and normal, and the contact point as the witness on A's surface: the
// point of A furthest TOWARD B, which at convergence is within `SWEEP_TOUCH_TOLERANCE` of B.
//
// The point is APPROXIMATE where a support function is ambiguous, and a caller should know which. A
// support along a direction parallel to a flat face may return any point of that face, so a box struck
// squarely reports one of its corners rather than the middle of the contact. The fraction and the normal
// have no such ambiguity. A consumer that needs an exact point should regenerate the manifold after
// advancing to the fraction; one that only needs to know WHEN and ALONG WHAT can use these directly.
function writeTimeOfImpact3D(
  out: CollisionTimeOfImpact3D,
  shapeA: Readonly<CollisionShape3D>,
  translation: readonly number[],
  fraction: number,
  normalX: number,
  normalY: number,
  normalZ: number,
): boolean {
  out.fraction = fraction;
  out.normalX = normalX;
  out.normalY = normalY;
  out.normalZ = normalZ;

  const supportA = getCollisionSupport3D(shapeA.kind);
  if (supportA === null || (normalX === 0 && normalY === 0 && normalZ === 0)) return true;
  // The direction points from B toward A, so A's closest feature is its support along the NEGATION.
  supportA(shapeA, -normalX, -normalY, -normalZ, scratchWitness);
  out.x = scratchWitness[0] + translation[0] * fraction;
  out.y = scratchWitness[1] + translation[1] * fraction;
  out.z = scratchWitness[2] + translation[2] * fraction;
  return true;
}

// The gap at which the pair counts as touching. Absolute, and larger than the distance query's own
// convergence floor on purpose: advancement approaches contact asymptotically, so a tolerance at the
// query's precision would spend every iteration halving an already-negligible gap.
const SWEEP_TOUCH_TOLERANCE = 1e-6;

const MAX_SWEEP_ITERATIONS = 32;

const scratchDistance = createCollisionDistance3D();

const translationA = [0, 0, 0];

const scratchWitness = [0, 0, 0];
