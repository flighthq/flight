import type { CollisionShape3D, CollisionTimeOfImpact3D } from '@flighthq/types/contract';

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

  // The last measurement the pair was measurably APART on. All of it has to be carried rather than read
  // at the end, because the final measurement is the one that reports contact — and a query with no gap
  // has neither an axis nor a pair of witnesses, so it clears both on its way out. Reading them there
  // yields a zero normal at the origin with a perfectly correct fraction, which is worse than any one of
  // those being wrong alone: the impact looks found.
  //
  // The witnesses additionally carry the FRACTION they were taken at, because unlike the direction they
  // are positions and do not survive the trip on their own. A head-on approach converges onto exactly
  // touching, so the last separated measurement can be a whole interval back — and using its witness
  // as-is reports the contact at the point the shapes were closest at when they were still far apart.
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  let pointAX = 0;
  let pointAY = 0;
  let pointAZ = 0;
  let pointBX = 0;
  let pointBY = 0;
  let pointBZ = 0;
  let measuredFraction = 0;
  // Whether a contact was actually reached, tracked explicitly rather than inferred from the fraction or
  // the last gap. The loop has two successful exits and one failing one, and they are not distinguishable
  // after the fact: an exhausted budget and an overlap both leave a positive fraction and no measurable
  // gap, and reading the state instead of recording it reports the unconverged case as a found impact.
  let impacted = false;
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
      // measurement, so its normal and point stay zero the way a raycast from inside a shape reports none.
      if (!scratchDistance.overlapping) return false;
      impacted = true;
      break;
    }

    normalX = scratchDistance.directionX;
    normalY = scratchDistance.directionY;
    normalZ = scratchDistance.directionZ;
    pointAX = scratchDistance.pointAX;
    pointAY = scratchDistance.pointAY;
    pointAZ = scratchDistance.pointAZ;
    pointBX = scratchDistance.pointBX;
    pointBY = scratchDistance.pointBY;
    pointBZ = scratchDistance.pointBZ;
    measuredFraction = fraction;
    if (scratchDistance.distance <= SWEEP_TOUCH_TOLERANCE) {
      impacted = true;
      break;
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
  if (!impacted) return false;

  out.fraction = fraction;
  out.normalX = normalX;
  out.normalY = normalY;
  out.normalZ = normalZ;

  // A's witness ADVANCES to the impact; B's does not, because the posed frame holds B still and gives A
  // the whole relative motion. Over that last advance the closest features cannot change — that a shape
  // can approach no faster than the closing speed along the axis is the premise conservative advancement
  // rests on — so carrying the witness forward is exact rather than an extrapolation.
  const advance = fraction - measuredFraction;
  // MIDWAY between the two, which at contact coincide to within the touch tolerance. The midpoint is the
  // only choice that treats the pair symmetrically: reporting A's witness would put the same impact in a
  // different place depending on which shape the caller happened to pass first.
  const midX = (pointAX + relativeX * advance + pointBX) * 0.5;
  const midY = (pointAY + relativeY * advance + pointBY) * 0.5;
  const midZ = (pointAZ + relativeZ * advance + pointBZ) * 0.5;
  // Back to world space. The posed frame left out B's OWN translation, and it is the same displacement
  // for both shapes, which is why one correction serves a point lying between them.
  out.x = midX + translationBX * fraction;
  out.y = midY + translationBY * fraction;
  out.z = midZ + translationBZ * fraction;
  return true;
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

// The gap at which the pair counts as touching. Absolute, and larger than the distance query's own
// convergence floor on purpose: advancement approaches contact asymptotically, so a tolerance at the
// query's precision would spend every iteration halving an already-negligible gap.
const SWEEP_TOUCH_TOLERANCE = 1e-6;

const MAX_SWEEP_ITERATIONS = 32;

const scratchDistance = createCollisionDistance3D();
