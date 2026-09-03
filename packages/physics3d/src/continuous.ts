import { createCollisionContactManifold3D, createCollisionTimeOfImpact3D } from '@flighthq/collision/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import type {
  CollisionContactManifold3D,
  CollisionTimeOfImpact3D,
  Physics3DContact,
  Physics3DRotationalCcdEnvelope,
  Physics3DWorld,
  RigidBody3D,
  SpatialPair,
} from '@flighthq/types/contract';

import { synchronizePhysics3DBroadphase, synchronizePhysics3DSweptBroadphase } from './broadphase';
import { collidePhysics3DColliderShapes, sweepPhysics3DColliderShapes } from './colliderCollision';
import { updatePhysics3DColliderWorldShape } from './colliderTransform';
import { createPhysics3DContact, createPhysics3DContactPoint } from './contacts';
import { integrateRigidBody3DPose, refreshRigidBody3DWorldInertia } from './integrate';
import { isPhysics3DPairJointSuppressed } from './jointCollisionSuppression';
import { isPhysics3DPairOrdered } from './jointRegistry';
import { mixPhysics3DFriction, mixPhysics3DRestitution } from './material';
import { steppingPhysics3DWorlds } from './ownership';
import { isPhysics3DContactValid } from './stepValidation';
import {
  applySymmetricTensor,
  TENSOR_XX,
  TENSOR_XY,
  TENSOR_XZ,
  TENSOR_YY,
  TENSOR_YZ,
  TENSOR_ZZ,
} from './symmetricTensor';
import { writeRigidBody3DWorldCenter } from './world';

// Continuous collision: advancing poses in chronological order of impact rather than in one jump.
//
// The ordinary discrete path integrates every body across the whole interval and then asks what overlaps.
// A body fast enough to cross a wall within one interval overlaps NOTHING at either end, so it passes
// through — and no amount of solver iteration recovers it, because the contact was never generated. This
// path finds the earliest impact in the interval, advances everything only that far, resolves it, and
// repeats.
//
// Opt-in per world (`config.continuousCollision`) and per body (`body.bullet`), because it costs a swept
// query per candidate pair per sub-interval. The discrete path remains the default and is what almost
// every body wants.

// Whether any body in this world is currently asking for continuous treatment. Checked before the
// continuous path runs at all, so a world that enabled the config but has no bullets pays one scan
// rather than a swept broadphase.
export function hasActivePhysics3DBullet(world: Readonly<Physics3DWorld>): boolean {
  for (const body of world.bodies) {
    if (body.type === 'dynamic' && body.bullet && !body.sleeping) return true;
  }
  return false;
}

// Advances every awake body across `dt`, stopping at each impact in chronological order.
//
// The substep budget is a HARD bound rather than a convergence target: an adversarial scene — a fast body
// in a narrow gap — can generate impacts without limit, and a loop that ran until none were left would
// make one frame's cost unbounded. When the budget runs out the remaining time is advanced discretely,
// which is the behaviour the caller would have had anyway. A custom loop entering here directly acquires
// the same mutation boundary as `stepPhysics3D`; the standard step already owns it. A second continuous
// entry on the same world is always recursion and is rejected before it can share this function's scratch
// or advance a half-resolved impact from inside a contact hook.
export function integratePhysics3DContinuous(world: Physics3DWorld, dt: number): void {
  if (integratingPhysics3DWorlds.has(world)) {
    throw new Error('Cannot integrate a physics world recursively while it is stepping');
  }
  const scratch = acquirePhysics3DContinuousScratch();
  const ownsMutationBoundary = !steppingPhysics3DWorlds.has(world);
  integratingPhysics3DWorlds.add(world);
  if (ownsMutationBoundary) steppingPhysics3DWorlds.add(world);
  try {
    let remaining = dt;
    for (let substep = 0; substep < world.config.maxCcdSubsteps && remaining > 0; substep += 1) {
      if (!findEarliestPhysics3DImpact(world, remaining, scratch)) break;

      const advance = remaining * scratch.fraction;
      advanceAwakePhysics3DBodies(world, advance);
      remaining -= advance;
      synchronizePhysics3DBroadphase(world);
      resolvePhysics3DImpact(world, scratch);
      // The impact landed at the very end of the interval, so there is no time left to advance into.
      if (scratch.fraction >= 1) return;
    }
    if (remaining > 0) advanceAwakePhysics3DBodies(world, remaining);
  } finally {
    releasePhysics3DContinuousScratch(scratch);
    if (ownsMutationBoundary) steppingPhysics3DWorlds.delete(world);
    integratingPhysics3DWorlds.delete(world);
  }
}

// Writes the configured rotational CCD sampling guarantee without running a world. This is the authoring
// check for a fast blade or offset collider: feed it the maximum angular speed and the furthest collider
// point from the body origin, then compare the reported angular/arc gap with the thinnest interaction the
// game must not miss.
export function writePhysics3DRotationalCcdEnvelope(
  angularSpeed: number,
  maximumRadius: number,
  dt: number,
  maxSubsteps: number,
  out: Physics3DRotationalCcdEnvelope,
): boolean {
  if (
    !Number.isFinite(angularSpeed) ||
    angularSpeed < 0 ||
    !Number.isFinite(maximumRadius) ||
    maximumRadius < 0 ||
    !Number.isFinite(dt) ||
    dt < 0 ||
    !Number.isSafeInteger(maxSubsteps) ||
    maxSubsteps < 0
  ) {
    clearPhysics3DRotationalCcdEnvelope(out);
    return false;
  }
  const angularTravel = angularSpeed * dt;
  if (!Number.isFinite(angularTravel)) {
    clearPhysics3DRotationalCcdEnvelope(out);
    return false;
  }
  const sampleCount = getPhysics3DRotationSampleCount(angularTravel, maxSubsteps);
  const maxAngularIncrement =
    angularTravel === 0 ? 0 : sampleCount === 0 ? Number.POSITIVE_INFINITY : angularTravel / sampleCount;
  out.angularTravel = angularTravel;
  out.sampleCount = sampleCount;
  out.maxAngularIncrement = maxAngularIncrement;
  out.maxPointArcTravel = maximumRadius === 0 ? 0 : maximumRadius * maxAngularIncrement;
  out.targetIncrementMet = angularTravel === 0 || maxAngularIncrement <= CCD_ROTATION_INCREMENT;
  return true;
}

function clearPhysics3DRotationalCcdEnvelope(out: Physics3DRotationalCcdEnvelope): void {
  out.angularTravel = 0;
  out.sampleCount = 0;
  out.maxAngularIncrement = 0;
  out.maxPointArcTravel = 0;
  out.targetIncrementMet = false;
}

function advanceAwakePhysics3DBodies(world: Physics3DWorld, dt: number): void {
  for (const body of world.bodies) {
    if (body.type === 'static' || body.sleeping) continue;
    integrateRigidBody3DPose(body, dt);
    refreshRigidBody3DWorldInertia(body);
  }
}

// Finds the earliest impact among the pairs eligible for continuous treatment, writing it into `scratch`.
//
// The swept broadphase is widened, queried, and IMMEDIATELY restored, so nothing outside this function
// ever observes the inflated bounds — a query made between substeps would otherwise report bodies as
// candidates at positions they are not at.
function findEarliestPhysics3DImpact(world: Physics3DWorld, dt: number, scratch: Physics3DContinuousScratch): boolean {
  scratch.fraction = Number.POSITIVE_INFINITY;
  scratch.bodyA = -1;
  scratch.bodyB = -1;

  synchronizePhysics3DSweptBroadphase(world, dt);
  world.index.querySpatialPairs(scratch.pairs);
  synchronizePhysics3DBroadphase(world);

  for (const pair of scratch.pairs) {
    const first = world.bodyByIndex.get(pair.a);
    const second = world.bodyByIndex.get(pair.b);
    if (first === undefined || second === undefined) continue;

    const ordered = isPhysics3DPairOrdered(first.index, second.index);
    const bodyA = ordered ? first : second;
    const bodyB = ordered ? second : first;
    if (!isPhysics3DCcdPairActive(bodyA, bodyB)) continue;
    if (isPhysics3DPairJointSuppressed(world, bodyA.index, bodyB.index)) continue;

    for (let i = 0; i < bodyA.colliders.length; i += 1) {
      for (let j = 0; j < bodyB.colliders.length; j += 1) {
        const colliderA = bodyA.colliders[i];
        const colliderB = bodyB.colliders[j];
        if (!isPhysics3DColliderPairEnabled(colliderA, colliderB)) continue;
        if (colliderA.sensor || colliderB.sensor) continue;
        if (!findPhysics3DColliderImpact(world, bodyA, bodyB, colliderA, colliderB, dt, false, scratch)) continue;
        const candidate = scratch.candidateRotational ? scratch.rotationalImpact : scratch.linearImpact;
        if (candidate.fraction >= scratch.fraction) continue;

        scratch.fraction = candidate.fraction;
        scratch.bodyA = bodyA.index;
        scratch.bodyB = bodyB.index;
        scratch.colliderA = i;
        scratch.colliderB = j;
        scratch.normalX = candidate.normalX;
        scratch.normalY = candidate.normalY;
        scratch.normalZ = candidate.normalZ;
        scratch.friction = mixPhysics3DFriction(colliderA.material.friction, colliderB.material.friction);
        scratch.restitution = mixPhysics3DRestitution(colliderA.material.restitution, colliderB.material.restitution);
        scratch.rotational = scratch.candidateRotational;
        scratch.pointCount = scratch.rotational ? scratch.rotationalManifold.pointCount : 1;
        if (scratch.rotational) {
          for (let point = 0; point < scratch.pointCount; point += 1) {
            const source = scratch.rotationalManifold.points[point];
            const offset = point * 3;
            scratch.points[offset] = source.x;
            scratch.points[offset + 1] = source.y;
            scratch.points[offset + 2] = source.z;
            scratch.depths[point] = source.depth;
            scratch.featureIds[point] = source.featureId;
          }
        } else {
          scratch.points[0] = candidate.x;
          scratch.points[1] = candidate.y;
          scratch.points[2] = candidate.z;
          scratch.depths[0] = 0;
          scratch.featureIds[0] = 0;
        }
      }
    }
  }

  // Sensor sweeps are evaluated only after the earliest solid TOI is known. Reporting them in the first
  // pass can publish a trigger behind a nearer wall even though that wall stops the bullet before it ever
  // reaches the trigger. Every sensor at or before the solid boundary is observable; later sensors are
  // reconsidered from the post-impact state on the next bounded CCD sub-interval.
  reportPhysics3DSensorImpactsBeforeFraction(world, dt, scratch.fraction, scratch);
  return scratch.bodyA >= 0;
}

function reportPhysics3DSensorImpactsBeforeFraction(
  world: Physics3DWorld,
  dt: number,
  maximumFraction: number,
  scratch: Physics3DContinuousScratch,
): void {
  for (let pairIndex = 0; pairIndex < scratch.pairs.length; pairIndex += 1) {
    const pair = scratch.pairs[pairIndex];
    const first = world.bodyByIndex.get(pair.a);
    const second = world.bodyByIndex.get(pair.b);
    if (first === undefined || second === undefined) continue;

    const ordered = isPhysics3DPairOrdered(first.index, second.index);
    const bodyA = ordered ? first : second;
    const bodyB = ordered ? second : first;
    if (!isPhysics3DCcdPairActive(bodyA, bodyB)) continue;
    if (isPhysics3DPairJointSuppressed(world, bodyA.index, bodyB.index)) continue;

    for (let colliderAIndex = 0; colliderAIndex < bodyA.colliders.length; colliderAIndex += 1) {
      for (let colliderBIndex = 0; colliderBIndex < bodyB.colliders.length; colliderBIndex += 1) {
        const colliderA = bodyA.colliders[colliderAIndex];
        const colliderB = bodyB.colliders[colliderBIndex];
        if (!colliderA.sensor && !colliderB.sensor) continue;
        if (!isPhysics3DColliderPairEnabled(colliderA, colliderB)) continue;
        if (
          hasPhysics3DContactTransition(world.events.began, bodyA.index, bodyB.index, colliderAIndex, colliderBIndex)
        ) {
          continue;
        }
        if (!findPhysics3DColliderImpact(world, bodyA, bodyB, colliderA, colliderB, dt, true, scratch)) continue;
        const candidate = scratch.candidateRotational ? scratch.rotationalImpact : scratch.linearImpact;
        if (candidate.fraction > maximumFraction) continue;
        reportPhysics3DSensorImpact(
          world,
          bodyA,
          bodyB,
          colliderAIndex,
          colliderBIndex,
          colliderA,
          colliderB,
          candidate,
          scratch.candidateRotational,
          dt,
          scratch,
        );
      }
    }
  }
}

// Selects the earlier analytic-translation or sampled-rotation impact for one collider pair. Sensors
// accept any crossing because they generate no impulse; solids additionally require an approaching
// velocity so a grazing or separating touch cannot consume the chronological substep budget.
function findPhysics3DColliderImpact(
  world: Readonly<Physics3DWorld>,
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  colliderA: RigidBody3D['colliders'][number],
  colliderB: RigidBody3D['colliders'][number],
  dt: number,
  acceptNonApproaching: boolean,
  scratch: Physics3DContinuousScratch,
): boolean {
  const movingA = isPhysics3DBodyMoving(bodyA);
  const movingB = isPhysics3DBodyMoving(bodyB);
  // Preserve the analytic translation sweep even while the body spins. Replacing it with angular
  // samples would let a fast, slightly rotating bullet cross a thin wall between those samples.
  const linearHit =
    sweepPhysics3DColliderShapes(
      colliderA.world,
      movingA ? bodyA.velocityX * dt : 0,
      movingA ? bodyA.velocityY * dt : 0,
      movingA ? bodyA.velocityZ * dt : 0,
      colliderB.world,
      movingB ? bodyB.velocityX * dt : 0,
      movingB ? bodyB.velocityY * dt : 0,
      movingB ? bodyB.velocityZ * dt : 0,
      scratch.linearImpact,
      1,
    ) && scratch.linearImpact.fraction > 0;
  const angularTravelA = movingA
    ? Math.hypot(bodyA.angularVelocityX, bodyA.angularVelocityY, bodyA.angularVelocityZ) * dt
    : 0;
  const angularTravelB = movingB
    ? Math.hypot(bodyB.angularVelocityX, bodyB.angularVelocityY, bodyB.angularVelocityZ) * dt
    : 0;
  const rotationalHit =
    (angularTravelA > 0 || angularTravelB > 0) &&
    world.config.maxCcdRotationSubsteps > 0 &&
    findPhysics3DRotationalImpact(
      bodyA,
      bodyB,
      colliderA,
      colliderB,
      dt,
      Math.max(angularTravelA, angularTravelB),
      world.config.maxCcdRotationSubsteps,
      scratch,
    ) &&
    scratch.rotationalImpact.fraction > 0;

  let found = false;
  scratch.candidateRotational = false;
  if (linearHit && (acceptNonApproaching || isPhysics3DImpactApproaching(bodyA, bodyB, scratch.linearImpact))) {
    found = true;
  }
  if (
    rotationalHit &&
    (!found || scratch.rotationalImpact.fraction < scratch.linearImpact.fraction) &&
    (acceptNonApproaching || isPhysics3DRotationalImpactApproaching(bodyA, bodyB, scratch.rotationalManifold, scratch))
  ) {
    found = true;
    scratch.candidateRotational = true;
  }
  return found;
}

// Rotation changes a convex shape rather than translating a fixed one, so collision's analytic linear
// sweep cannot answer it. Sample at a bounded angular increment, then bisect the first overlapping
// interval. The hard cap keeps multi-revolution bodies deterministic in cost; zero selects the linear
// path above.
function findPhysics3DRotationalImpact(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  colliderA: RigidBody3D['colliders'][number],
  colliderB: RigidBody3D['colliders'][number],
  dt: number,
  angularTravel: number,
  maxSubsteps: number,
  scratch: Physics3DContinuousScratch,
): boolean {
  // A pair already touching is the discrete solver's work. Without this check bisection reports the
  // first sample as a new impact infinitesimally after zero and consumes CCD budget without advancing.
  if (testPhysics3DColliderOverlapAtFraction(bodyA, bodyB, colliderA, colliderB, dt, 0, scratch)) return false;
  const substeps = getPhysics3DRotationSampleCount(angularTravel, maxSubsteps);
  let lowerFraction = 0;
  for (let sample = 1; sample <= substeps; sample += 1) {
    const upperFraction = sample / substeps;
    if (!testPhysics3DColliderOverlapAtFraction(bodyA, bodyB, colliderA, colliderB, dt, upperFraction, scratch)) {
      lowerFraction = upperFraction;
      continue;
    }

    let lower = lowerFraction;
    let upper = upperFraction;
    for (let iteration = 0; iteration < CCD_ROTATION_BISECTION_ITERATIONS; iteration += 1) {
      const middle = (lower + upper) * 0.5;
      if (testPhysics3DColliderOverlapAtFraction(bodyA, bodyB, colliderA, colliderB, dt, middle, scratch)) {
        upper = middle;
      } else {
        lower = middle;
      }
    }
    testPhysics3DColliderOverlapAtFraction(bodyA, bodyB, colliderA, colliderB, dt, upper, scratch);
    const manifold = scratch.rotationalManifold;
    let pointX = 0;
    let pointY = 0;
    let pointZ = 0;
    for (let point = 0; point < manifold.pointCount; point += 1) {
      pointX += manifold.points[point].x;
      pointY += manifold.points[point].y;
      pointZ += manifold.points[point].z;
    }
    const inverseCount = manifold.pointCount > 0 ? 1 / manifold.pointCount : 0;
    scratch.rotationalImpact.fraction = upper;
    scratch.rotationalImpact.x = pointX * inverseCount;
    scratch.rotationalImpact.y = pointY * inverseCount;
    scratch.rotationalImpact.z = pointZ * inverseCount;
    scratch.rotationalImpact.normalX = manifold.normalX;
    scratch.rotationalImpact.normalY = manifold.normalY;
    scratch.rotationalImpact.normalZ = manifold.normalZ;
    return manifold.pointCount > 0;
  }
  return false;
}

function getPhysics3DRotationSampleCount(angularTravel: number, maxSubsteps: number): number {
  if (!(angularTravel > 0) || maxSubsteps <= 0) return 0;
  return Math.min(maxSubsteps, Math.max(1, Math.ceil(angularTravel / CCD_ROTATION_INCREMENT)));
}

function testPhysics3DColliderOverlapAtFraction(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  colliderA: RigidBody3D['colliders'][number],
  colliderB: RigidBody3D['colliders'][number],
  dt: number,
  fraction: number,
  scratch: Physics3DContinuousScratch,
): boolean {
  savePhysics3DBodyPose(bodyA, scratch.poseA);
  savePhysics3DBodyPose(bodyB, scratch.poseB);
  try {
    integrateRigidBody3DPose(bodyA, dt * fraction);
    integrateRigidBody3DPose(bodyB, dt * fraction);
    updatePhysics3DColliderWorldShape(colliderA, bodyA);
    updatePhysics3DColliderWorldShape(colliderB, bodyB);
    const overlapping = collidePhysics3DColliderShapes(colliderA.world, colliderB.world, scratch.rotationalManifold);
    if (overlapping) {
      writeRigidBody3DWorldCenter(bodyA, scratch.candidateCenterA);
      writeRigidBody3DWorldCenter(bodyB, scratch.candidateCenterB);
    }
    return overlapping;
  } finally {
    restorePhysics3DBodyPose(bodyA, scratch.poseA);
    restorePhysics3DBodyPose(bodyB, scratch.poseB);
    updatePhysics3DColliderWorldShape(colliderA, bodyA);
    updatePhysics3DColliderWorldShape(colliderB, bodyB);
  }
}

function savePhysics3DBodyPose(body: Readonly<RigidBody3D>, out: number[]): void {
  out[0] = body.x;
  out[1] = body.y;
  out[2] = body.z;
  out[3] = body.orientationX;
  out[4] = body.orientationY;
  out[5] = body.orientationZ;
  out[6] = body.orientationW;
}

function restorePhysics3DBodyPose(body: RigidBody3D, pose: readonly number[]): void {
  body.x = pose[0];
  body.y = pose[1];
  body.z = pose[2];
  body.orientationX = pose[3];
  body.orientationY = pose[4];
  body.orientationZ = pose[5];
  body.orientationW = pose[6];
}

function isPhysics3DBodyMoving(body: Readonly<RigidBody3D>): boolean {
  return body.type !== 'static' && !body.sleeping;
}

// Continuous treatment needs at least one body ASKING for it and at least one that can be moved by the
// resolution. Two immovable bodies produce an impact nothing can respond to.
function isPhysics3DCcdPairActive(bodyA: Readonly<RigidBody3D>, bodyB: Readonly<RigidBody3D>): boolean {
  const bulletA = bodyA.type === 'dynamic' && bodyA.bullet && !bodyA.sleeping;
  const bulletB = bodyB.type === 'dynamic' && bodyB.bullet && !bodyB.sleeping;
  if (!bulletA && !bulletB) return false;
  return bodyA.inverseMass > 0 || bodyB.inverseMass > 0;
}

function isPhysics3DColliderPairEnabled(
  colliderA: Readonly<RigidBody3D['colliders'][number]>,
  colliderB: Readonly<RigidBody3D['colliders'][number]>,
): boolean {
  const filterA = colliderA.filter;
  const filterB = colliderB.filter;
  if (filterA.groupIndex !== 0 && filterA.groupIndex === filterB.groupIndex) return filterA.groupIndex > 0;
  return (filterA.maskBits & filterB.categoryBits) !== 0 && (filterB.maskBits & filterA.categoryBits) !== 0;
}

// Whether the pair is actually closing, rather than merely arriving at a shared surface while
// separating. A grazing pass touches without approaching, and stopping the world for one would halt a
// body that was never going to collide.
function isPhysics3DImpactApproaching(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  impact: Readonly<CollisionTimeOfImpact3D>,
): boolean {
  return getRelativeNormalVelocity(bodyA, bodyB, impact.normalX, impact.normalY, impact.normalZ) < -APPROACH_EPSILON;
}

function isPhysics3DRotationalImpactApproaching(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  manifold: Readonly<CollisionContactManifold3D>,
  scratch: Readonly<Physics3DContinuousScratch>,
): boolean {
  for (let point = 0; point < manifold.pointCount; point += 1) {
    const source = manifold.points[point];
    if (
      getRelativePointNormalVelocity(
        bodyA,
        bodyB,
        source.x - scratch.candidateCenterA[0],
        source.y - scratch.candidateCenterA[1],
        source.z - scratch.candidateCenterA[2],
        source.x - scratch.candidateCenterB[0],
        source.y - scratch.candidateCenterB[1],
        source.z - scratch.candidateCenterB[2],
        manifold.normalX,
        manifold.normalY,
        manifold.normalZ,
      ) < -APPROACH_EPSILON
    ) {
      return true;
    }
  }
  return false;
}

// The relative velocity of the two bodies along the normal, between their centres of mass. Negative means
// approaching, matching the sign convention the contact solver uses.
function getRelativeNormalVelocity(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  normalX: number,
  normalY: number,
  normalZ: number,
): number {
  return (
    (bodyA.velocityX - bodyB.velocityX) * normalX +
    (bodyA.velocityY - bodyB.velocityY) * normalY +
    (bodyA.velocityZ - bodyB.velocityZ) * normalZ
  );
}

// Publishes a solid TOI through the ordinary persistent-contact lane. Appending is deliberate: contact
// constraints prepared earlier in the interval store list indices, so inserting into canonical order
// here would retarget those constraints midway through their solve. The step restores canonical order
// after its position pass, once those indices have expired.
function writePhysics3DImpactContact(
  world: Physics3DWorld,
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  scratch: Physics3DContinuousScratch,
): Physics3DContact {
  let contact: Physics3DContact | null = null;
  for (let index = 0; index < world.contacts.length; index += 1) {
    const existing = world.contacts[index];
    if (
      existing.bodyA === scratch.bodyA &&
      existing.bodyB === scratch.bodyB &&
      existing.colliderA === scratch.colliderA &&
      existing.colliderB === scratch.colliderB
    ) {
      contact = existing;
      break;
    }
  }

  scratch.contactCreated = contact === null;
  if (contact === null) {
    contact = createPhysics3DContact(scratch.bodyA, scratch.bodyB, scratch.colliderA, scratch.colliderB);
    contact.normalX = scratch.normalX;
    contact.normalY = scratch.normalY;
    contact.normalZ = scratch.normalZ;
    contact.friction = scratch.friction;
    contact.restitution = scratch.restitution;
    contact.touching = true;
    world.contacts.push(contact);
    world.events.began.push(contact);
  }

  contact.normalX = scratch.normalX;
  contact.normalY = scratch.normalY;
  contact.normalZ = scratch.normalZ;
  contact.touching = true;
  while (contact.points.length < scratch.pointCount) contact.points.push(createPhysics3DContactPoint());
  writeRigidBody3DWorldCenter(bodyA, scratch.centerA);
  writeRigidBody3DWorldCenter(bodyB, scratch.centerB);
  for (let pointIndex = 0; pointIndex < scratch.pointCount; pointIndex += 1) {
    const offset = pointIndex * 3;
    const point = contact.points[pointIndex];
    point.x = scratch.points[offset];
    point.y = scratch.points[offset + 1];
    point.z = scratch.points[offset + 2];
    point.depth = scratch.depths[pointIndex];
    point.featureId = scratch.featureIds[pointIndex];
    point.rAX = point.x - scratch.centerA[0];
    point.rAY = point.y - scratch.centerA[1];
    point.rAZ = point.z - scratch.centerA[2];
    point.rBX = point.x - scratch.centerB[0];
    point.rBY = point.y - scratch.centerB[1];
    point.rBZ = point.z - scratch.centerB[2];
  }
  contact.pointCount = scratch.pointCount;
  return contact;
}

// A sensor impact enters the ordinary persistent-contact lane at TOI. It cannot stop the body, and only
// a later pose can prove whether the body crossed the whole volume or ended inside it, so the next
// contact-intake pass makes that decision — a later solver substep or the next public step. A pass-through
// emits `ended` there with the SAME record identity; a body that remains overlapping simply keeps the
// record. Sensors invoke neither contact hook and resolve no impulse, matching the discrete sensor
// contract.
function reportPhysics3DSensorImpact(
  world: Physics3DWorld,
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  colliderAIndex: number,
  colliderBIndex: number,
  colliderA: Readonly<RigidBody3D['colliders'][number]>,
  colliderB: Readonly<RigidBody3D['colliders'][number]>,
  impact: Readonly<CollisionTimeOfImpact3D>,
  rotational: boolean,
  dt: number,
  scratch: Physics3DContinuousScratch,
): void {
  if (hasPhysics3DContactTransition(world.events.began, bodyA.index, bodyB.index, colliderAIndex, colliderBIndex)) {
    return;
  }

  savePhysics3DBodyPose(bodyA, scratch.poseA);
  savePhysics3DBodyPose(bodyB, scratch.poseB);
  try {
    integrateRigidBody3DPose(bodyA, dt * impact.fraction);
    integrateRigidBody3DPose(bodyB, dt * impact.fraction);
    writeRigidBody3DWorldCenter(bodyA, scratch.centerA);
    writeRigidBody3DWorldCenter(bodyB, scratch.centerB);
  } finally {
    restorePhysics3DBodyPose(bodyA, scratch.poseA);
    restorePhysics3DBodyPose(bodyB, scratch.poseB);
  }

  const pointCount = rotational ? scratch.rotationalManifold.pointCount : 1;
  const contact = createPhysics3DContact(bodyA.index, bodyB.index, colliderAIndex, colliderBIndex);
  contact.normalX = impact.normalX;
  contact.normalY = impact.normalY;
  contact.normalZ = impact.normalZ;
  contact.pointCount = pointCount;
  contact.friction = mixPhysics3DFriction(colliderA.material.friction, colliderB.material.friction);
  contact.restitution = mixPhysics3DRestitution(colliderA.material.restitution, colliderB.material.restitution);
  contact.sensor = true;
  contact.touching = true;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const source = rotational ? scratch.rotationalManifold.points[pointIndex] : impact;
    const point = createPhysics3DContactPoint();
    point.x = source.x;
    point.y = source.y;
    point.z = source.z;
    point.depth = rotational ? scratch.rotationalManifold.points[pointIndex].depth : 0;
    point.featureId = rotational ? scratch.rotationalManifold.points[pointIndex].featureId : 0;
    point.rAX = point.x - scratch.centerA[0];
    point.rAY = point.y - scratch.centerA[1];
    point.rAZ = point.z - scratch.centerA[2];
    point.rBX = point.x - scratch.centerB[0];
    point.rBY = point.y - scratch.centerB[1];
    point.rBZ = point.z - scratch.centerB[2];
    contact.points.push(point);
  }
  world.contacts.push(contact);
  world.events.began.push(contact);
}

function hasPhysics3DContactTransition(
  contacts: readonly Physics3DContact[],
  bodyA: number,
  bodyB: number,
  colliderA: number,
  colliderB: number,
): boolean {
  for (let index = 0; index < contacts.length; index += 1) {
    const contact = contacts[index];
    if (
      contact.bodyA === bodyA &&
      contact.bodyB === bodyB &&
      contact.colliderA === colliderA &&
      contact.colliderB === colliderB
    ) {
      return true;
    }
  }
  return false;
}

// The ordinary pre-solve hook has already run before pose integration. A contact discovered later by
// CCD gets exactly one equivalent invocation at TOI, before its impact impulse. Invalid writes and
// throws restore the four mutable override fields just like the ordinary lane. Because the step has
// necessarily advanced to discover this TOI, an exception leaves poses at the impact and retains the new
// contact/event rather than rolling the entire simulation back; that exception boundary is part of the
// CCD hook contract.
function runPhysics3DImpactPreSolveHook(world: Physics3DWorld, contact: Physics3DContact): void {
  const hook = world.contactHooks.preSolve;
  if (hook === null) return;
  const friction = contact.friction;
  const restitution = contact.restitution;
  const enabled = contact.enabled;
  const sensor = contact.sensor;
  try {
    hook(world, contact);
  } catch (error) {
    restorePhysics3DImpactHookFields(contact, friction, restitution, enabled, sensor);
    throw error;
  }
  if (!isPhysics3DContactValid(contact)) {
    restorePhysics3DImpactHookFields(contact, friction, restitution, enabled, sensor);
    throw new Error('Physics3D pre-solve hook produced invalid contact state');
  }
}

function restorePhysics3DImpactHookFields(
  contact: Physics3DContact,
  friction: number,
  restitution: number,
  enabled: boolean,
  sensor: boolean,
): void {
  contact.friction = friction;
  contact.restitution = restitution;
  contact.enabled = enabled;
  contact.sensor = sensor;
}

// Removes the approach velocity with a single LINEAR normal impulse through the centres of mass.
//
// NO LEVER ARM, and that omission is deliberate rather than a shortcut taken for speed. The impact
// carries a contact point, and it is a genuine one — the sweep reports the GJK witness, which is exact
// even where the closest feature is interior to an edge. The problem is not the point's accuracy, it is
// that one point cannot stand for a face-face contact. Where two flat faces meet, every point of the
// shared region is equally close and the witness settles on a CORNER of it; a box driven squarely into a
// wall would pick up `r x n` about that corner and come away spinning, from an impact that is symmetric
// and must produce no rotation at all. An earlier revision measured the other half of the same problem:
// a lever arm five units off-axis inflated the angular term by four orders of magnitude, the effective
// mass collapsed, and the impulse meant to stop a 600-unit-per-second bullet changed its velocity by
// 0.05. It tunnelled anyway, through a path that ran and reported success.
//
// The normal response therefore stays linear. Impact-time friction is linear too: it removes centre-of-
// mass tangential motion under the same Coulomb cone the ordinary solver uses, but invents no torque from
// the single witness. A rotational impact has a real manifold from its overlap sample and resolves both
// normal and friction impulses at those points, where the lever arms are supported by actual geometry.
// In both cases a persistent contact is published at TOI before resolution, so begin events and contact
// hooks observe the impact in the step where it happened rather than one frame later.
function resolvePhysics3DImpact(world: Physics3DWorld, scratch: Physics3DContinuousScratch): void {
  const bodyA = world.bodyByIndex.get(scratch.bodyA);
  const bodyB = world.bodyByIndex.get(scratch.bodyB);
  if (bodyA === undefined || bodyB === undefined) return;

  wakePhysics3DImpactBody(bodyA);
  wakePhysics3DImpactBody(bodyB);
  const contact = writePhysics3DImpactContact(world, bodyA, bodyB, scratch);
  if (scratch.contactCreated) runPhysics3DImpactPreSolveHook(world, contact);
  if (!contact.enabled || contact.sensor) return;

  if (scratch.rotational && scratch.pointCount > 0) {
    resolvePhysics3DRotationalImpact(world, bodyA, bodyB, contact, scratch);
    return;
  }

  const approach = getRelativeNormalVelocity(bodyA, bodyB, scratch.normalX, scratch.normalY, scratch.normalZ);
  if (approach >= 0) return;

  const totalInverseMass = bodyA.inverseMass + bodyB.inverseMass;
  if (!(totalInverseMass > 0)) return;

  const restitution = approach < -world.config.sequentialImpulse.restitutionThreshold ? contact.restitution : 0;
  const magnitude = (-(1 + restitution) * approach) / totalInverseMass;
  bodyA.velocityX += scratch.normalX * magnitude * bodyA.inverseMass;
  bodyA.velocityY += scratch.normalY * magnitude * bodyA.inverseMass;
  bodyA.velocityZ += scratch.normalZ * magnitude * bodyA.inverseMass;
  bodyB.velocityX -= scratch.normalX * magnitude * bodyB.inverseMass;
  bodyB.velocityY -= scratch.normalY * magnitude * bodyB.inverseMass;
  bodyB.velocityZ -= scratch.normalZ * magnitude * bodyB.inverseMass;

  const relativeX = bodyA.velocityX - bodyB.velocityX;
  const relativeY = bodyA.velocityY - bodyB.velocityY;
  const relativeZ = bodyA.velocityZ - bodyB.velocityZ;
  const normalVelocity = relativeX * scratch.normalX + relativeY * scratch.normalY + relativeZ * scratch.normalZ;
  const tangentVelocityX = relativeX - scratch.normalX * normalVelocity;
  const tangentVelocityY = relativeY - scratch.normalY * normalVelocity;
  const tangentVelocityZ = relativeZ - scratch.normalZ * normalVelocity;
  const tangentSpeed = Math.sqrt(
    tangentVelocityX * tangentVelocityX + tangentVelocityY * tangentVelocityY + tangentVelocityZ * tangentVelocityZ,
  );
  if (tangentSpeed <= 0 || contact.friction <= 0) return;
  const desiredMagnitude = tangentSpeed / totalInverseMass;
  const frictionMagnitude = Math.min(desiredMagnitude, contact.friction * magnitude);
  const scale = -frictionMagnitude / tangentSpeed;
  const impulseX = tangentVelocityX * scale;
  const impulseY = tangentVelocityY * scale;
  const impulseZ = tangentVelocityZ * scale;
  bodyA.velocityX += impulseX * bodyA.inverseMass;
  bodyA.velocityY += impulseY * bodyA.inverseMass;
  bodyA.velocityZ += impulseZ * bodyA.inverseMass;
  bodyB.velocityX -= impulseX * bodyB.inverseMass;
  bodyB.velocityY -= impulseY * bodyB.inverseMass;
  bodyB.velocityZ -= impulseZ * bodyB.inverseMass;
}

function resolvePhysics3DRotationalImpact(
  world: Readonly<Physics3DWorld>,
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  contact: Readonly<Physics3DContact>,
  scratch: Physics3DContinuousScratch,
): void {
  writeRigidBody3DWorldCenter(bodyA, scratch.centerA);
  writeRigidBody3DWorldCenter(bodyB, scratch.centerB);
  writePhysics3DImpactFrictionBasis(scratch.normalX, scratch.normalY, scratch.normalZ, scratch);
  for (let point = 0; point < scratch.pointCount; point += 1) {
    scratch.normalImpulses[point] = 0;
    scratch.tangentImpulses0[point] = 0;
    scratch.tangentImpulses1[point] = 0;
    const offset = point * 3;
    const approach = getRelativePointNormalVelocity(
      bodyA,
      bodyB,
      scratch.points[offset] - scratch.centerA[0],
      scratch.points[offset + 1] - scratch.centerA[1],
      scratch.points[offset + 2] - scratch.centerA[2],
      scratch.points[offset] - scratch.centerB[0],
      scratch.points[offset + 1] - scratch.centerB[1],
      scratch.points[offset + 2] - scratch.centerB[2],
      scratch.normalX,
      scratch.normalY,
      scratch.normalZ,
    );
    scratch.velocityBiases[point] =
      approach < -world.config.sequentialImpulse.restitutionThreshold ? -contact.restitution * approach : 0;
  }

  for (let iteration = 0; iteration < ROTATIONAL_IMPACT_ITERATIONS; iteration += 1) {
    for (let point = 0; point < scratch.pointCount; point += 1) {
      const offset = point * 3;
      const rAX = scratch.points[offset] - scratch.centerA[0];
      const rAY = scratch.points[offset + 1] - scratch.centerA[1];
      const rAZ = scratch.points[offset + 2] - scratch.centerA[2];
      const rBX = scratch.points[offset] - scratch.centerB[0];
      const rBY = scratch.points[offset + 1] - scratch.centerB[1];
      const rBZ = scratch.points[offset + 2] - scratch.centerB[2];
      const velocity = getRelativePointNormalVelocity(
        bodyA,
        bodyB,
        rAX,
        rAY,
        rAZ,
        rBX,
        rBY,
        rBZ,
        scratch.normalX,
        scratch.normalY,
        scratch.normalZ,
      );
      const mass = getPhysics3DImpactEffectiveMass(
        bodyA,
        bodyB,
        rAX,
        rAY,
        rAZ,
        rBX,
        rBY,
        rBZ,
        scratch.normalX,
        scratch.normalY,
        scratch.normalZ,
      );
      const impulse = Math.max(scratch.normalImpulses[point] + (scratch.velocityBiases[point] - velocity) * mass, 0);
      const delta = impulse - scratch.normalImpulses[point];
      scratch.normalImpulses[point] = impulse;
      applyPhysics3DImpactImpulse(
        bodyA,
        rAX,
        rAY,
        rAZ,
        scratch.normalX * delta,
        scratch.normalY * delta,
        scratch.normalZ * delta,
      );
      applyPhysics3DImpactImpulse(
        bodyB,
        rBX,
        rBY,
        rBZ,
        -scratch.normalX * delta,
        -scratch.normalY * delta,
        -scratch.normalZ * delta,
      );

      const maxFriction = contact.friction * impulse;
      const tangentVelocity0 = getRelativePointNormalVelocity(
        bodyA,
        bodyB,
        rAX,
        rAY,
        rAZ,
        rBX,
        rBY,
        rBZ,
        scratch.tangent0X,
        scratch.tangent0Y,
        scratch.tangent0Z,
      );
      const tangentMass0 = getPhysics3DImpactEffectiveMass(
        bodyA,
        bodyB,
        rAX,
        rAY,
        rAZ,
        rBX,
        rBY,
        rBZ,
        scratch.tangent0X,
        scratch.tangent0Y,
        scratch.tangent0Z,
      );
      let tangentImpulse0 = scratch.tangentImpulses0[point] - tangentVelocity0 * tangentMass0;
      const tangentVelocity1 = getRelativePointNormalVelocity(
        bodyA,
        bodyB,
        rAX,
        rAY,
        rAZ,
        rBX,
        rBY,
        rBZ,
        scratch.tangent1X,
        scratch.tangent1Y,
        scratch.tangent1Z,
      );
      const tangentMass1 = getPhysics3DImpactEffectiveMass(
        bodyA,
        bodyB,
        rAX,
        rAY,
        rAZ,
        rBX,
        rBY,
        rBZ,
        scratch.tangent1X,
        scratch.tangent1Y,
        scratch.tangent1Z,
      );
      let tangentImpulse1 = scratch.tangentImpulses1[point] - tangentVelocity1 * tangentMass1;
      const tangentMagnitude = Math.sqrt(tangentImpulse0 * tangentImpulse0 + tangentImpulse1 * tangentImpulse1);
      if (tangentMagnitude > maxFriction) {
        const frictionScale = maxFriction / tangentMagnitude;
        tangentImpulse0 *= frictionScale;
        tangentImpulse1 *= frictionScale;
      }
      const deltaTangent0 = tangentImpulse0 - scratch.tangentImpulses0[point];
      const deltaTangent1 = tangentImpulse1 - scratch.tangentImpulses1[point];
      scratch.tangentImpulses0[point] = tangentImpulse0;
      scratch.tangentImpulses1[point] = tangentImpulse1;
      const frictionX = scratch.tangent0X * deltaTangent0 + scratch.tangent1X * deltaTangent1;
      const frictionY = scratch.tangent0Y * deltaTangent0 + scratch.tangent1Y * deltaTangent1;
      const frictionZ = scratch.tangent0Z * deltaTangent0 + scratch.tangent1Z * deltaTangent1;
      applyPhysics3DImpactImpulse(bodyA, rAX, rAY, rAZ, frictionX, frictionY, frictionZ);
      applyPhysics3DImpactImpulse(bodyB, rBX, rBY, rBZ, -frictionX, -frictionY, -frictionZ);
    }
  }
}

function writePhysics3DImpactFrictionBasis(
  normalX: number,
  normalY: number,
  normalZ: number,
  out: Physics3DContinuousScratch,
): void {
  let seedX = 0;
  let seedY = 0;
  let seedZ = 0;
  if (Math.abs(normalX) < IMPACT_AXIS_SELECTION_THRESHOLD) seedX = 1;
  else if (Math.abs(normalY) < IMPACT_AXIS_SELECTION_THRESHOLD) seedY = 1;
  else seedZ = 1;
  let tangent0X = normalY * seedZ - normalZ * seedY;
  let tangent0Y = normalZ * seedX - normalX * seedZ;
  let tangent0Z = normalX * seedY - normalY * seedX;
  const length = Math.sqrt(tangent0X * tangent0X + tangent0Y * tangent0Y + tangent0Z * tangent0Z);
  if (length > 0) {
    const inverseLength = 1 / length;
    tangent0X *= inverseLength;
    tangent0Y *= inverseLength;
    tangent0Z *= inverseLength;
  }
  out.tangent0X = tangent0X;
  out.tangent0Y = tangent0Y;
  out.tangent0Z = tangent0Z;
  out.tangent1X = normalY * tangent0Z - normalZ * tangent0Y;
  out.tangent1Y = normalZ * tangent0X - normalX * tangent0Z;
  out.tangent1Z = normalX * tangent0Y - normalY * tangent0X;
}

function getRelativePointNormalVelocity(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  rAX: number,
  rAY: number,
  rAZ: number,
  rBX: number,
  rBY: number,
  rBZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
): number {
  const pointAX = bodyA.velocityX + bodyA.angularVelocityY * rAZ - bodyA.angularVelocityZ * rAY;
  const pointAY = bodyA.velocityY + bodyA.angularVelocityZ * rAX - bodyA.angularVelocityX * rAZ;
  const pointAZ = bodyA.velocityZ + bodyA.angularVelocityX * rAY - bodyA.angularVelocityY * rAX;
  const pointBX = bodyB.velocityX + bodyB.angularVelocityY * rBZ - bodyB.angularVelocityZ * rBY;
  const pointBY = bodyB.velocityY + bodyB.angularVelocityZ * rBX - bodyB.angularVelocityX * rBZ;
  const pointBZ = bodyB.velocityZ + bodyB.angularVelocityX * rBY - bodyB.angularVelocityY * rBX;
  return (pointAX - pointBX) * normalX + (pointAY - pointBY) * normalY + (pointAZ - pointBZ) * normalZ;
}

function getPhysics3DImpactEffectiveMass(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  rAX: number,
  rAY: number,
  rAZ: number,
  rBX: number,
  rBY: number,
  rBZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
): number {
  let denominator = bodyA.inverseMass + bodyB.inverseMass;
  denominator += getPhysics3DAngularMassTerm(bodyA, rAX, rAY, rAZ, normalX, normalY, normalZ);
  denominator += getPhysics3DAngularMassTerm(bodyB, rBX, rBY, rBZ, normalX, normalY, normalZ);
  return denominator > 0 ? 1 / denominator : 0;
}

function getPhysics3DAngularMassTerm(
  body: Readonly<RigidBody3D>,
  rX: number,
  rY: number,
  rZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
): number {
  const crossX = rY * normalZ - rZ * normalY;
  const crossY = rZ * normalX - rX * normalZ;
  const crossZ = rX * normalY - rY * normalX;
  readPhysics3DWorldInverseInertia(body, impactTensor);
  applySymmetricTensor(impactTensor, crossX, crossY, crossZ, impactVector);
  return crossX * impactVector[0] + crossY * impactVector[1] + crossZ * impactVector[2];
}

function applyPhysics3DImpactImpulse(
  body: RigidBody3D,
  rX: number,
  rY: number,
  rZ: number,
  impulseX: number,
  impulseY: number,
  impulseZ: number,
): void {
  body.velocityX += impulseX * body.inverseMass;
  body.velocityY += impulseY * body.inverseMass;
  body.velocityZ += impulseZ * body.inverseMass;
  const torqueX = rY * impulseZ - rZ * impulseY;
  const torqueY = rZ * impulseX - rX * impulseZ;
  const torqueZ = rX * impulseY - rY * impulseX;
  readPhysics3DWorldInverseInertia(body, impactTensor);
  applySymmetricTensor(impactTensor, torqueX, torqueY, torqueZ, impactVector);
  body.angularVelocityX += impactVector[0];
  body.angularVelocityY += impactVector[1];
  body.angularVelocityZ += impactVector[2];
}

function readPhysics3DWorldInverseInertia(body: Readonly<RigidBody3D>, out: number[]): void {
  out[TENSOR_XX] = body.inverseInertiaWorldXX;
  out[TENSOR_YY] = body.inverseInertiaWorldYY;
  out[TENSOR_ZZ] = body.inverseInertiaWorldZZ;
  out[TENSOR_XY] = body.inverseInertiaWorldXY;
  out[TENSOR_XZ] = body.inverseInertiaWorldXZ;
  out[TENSOR_YZ] = body.inverseInertiaWorldYZ;
}

function wakePhysics3DImpactBody(body: RigidBody3D): void {
  if (body.type === 'static') return;
  body.sleeping = false;
  body.sleepTimer = 0;
}

// Below this the pair is grazing rather than approaching, and stopping the world for it would halt a
// body that was never going to collide.
const APPROACH_EPSILON = 1e-9;
const CCD_ROTATION_INCREMENT = DEG_TO_RAD;
const CCD_ROTATION_BISECTION_ITERATIONS = 12;
const IMPACT_AXIS_SELECTION_THRESHOLD = 0.5773502691896258;
const ROTATIONAL_IMPACT_ITERATIONS = 4;
const impactTensor = [0, 0, 0, 0, 0, 0];
const impactVector = [0, 0, 0];

interface Physics3DContinuousScratch {
  pairs: SpatialPair[];
  linearImpact: CollisionTimeOfImpact3D;
  rotationalImpact: CollisionTimeOfImpact3D;
  fraction: number;
  bodyA: number;
  bodyB: number;
  colliderA: number;
  colliderB: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  friction: number;
  restitution: number;
  rotational: boolean;
  candidateRotational: boolean;
  contactCreated: boolean;
  rotationalManifold: CollisionContactManifold3D;
  pointCount: number;
  points: number[];
  depths: number[];
  featureIds: number[];
  normalImpulses: number[];
  tangentImpulses0: number[];
  tangentImpulses1: number[];
  velocityBiases: number[];
  tangent0X: number;
  tangent0Y: number;
  tangent0Z: number;
  tangent1X: number;
  tangent1Y: number;
  tangent1Z: number;
  centerA: number[];
  centerB: number[];
  candidateCenterA: number[];
  candidateCenterB: number[];
  poseA: number[];
  poseB: number[];
}

function acquirePhysics3DContinuousScratch(): Physics3DContinuousScratch {
  return physics3DContinuousScratchPool.pop() ?? createPhysics3DContinuousScratch();
}

function createPhysics3DContinuousScratch(): Physics3DContinuousScratch {
  return {
    pairs: [],
    linearImpact: createCollisionTimeOfImpact3D(),
    rotationalImpact: createCollisionTimeOfImpact3D(),
    fraction: 0,
    bodyA: -1,
    bodyB: -1,
    colliderA: -1,
    colliderB: -1,
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    friction: 0,
    restitution: 0,
    rotational: false,
    candidateRotational: false,
    contactCreated: false,
    rotationalManifold: createCollisionContactManifold3D(),
    pointCount: 0,
    points: new Array(12).fill(0),
    depths: new Array(4).fill(0),
    featureIds: new Array(4).fill(0),
    normalImpulses: new Array(4).fill(0),
    tangentImpulses0: new Array(4).fill(0),
    tangentImpulses1: new Array(4).fill(0),
    velocityBiases: new Array(4).fill(0),
    tangent0X: 0,
    tangent0Y: 0,
    tangent0Z: 0,
    tangent1X: 0,
    tangent1Y: 0,
    tangent1Z: 0,
    centerA: [0, 0, 0],
    centerB: [0, 0, 0],
    candidateCenterA: [0, 0, 0],
    candidateCenterB: [0, 0, 0],
    poseA: new Array(7).fill(0),
    poseB: new Array(7).fill(0),
  };
}

function releasePhysics3DContinuousScratch(scratch: Physics3DContinuousScratch): void {
  physics3DContinuousScratchPool.push(scratch);
}

const physics3DContinuousScratchPool: Physics3DContinuousScratch[] = [createPhysics3DContinuousScratch()];
const integratingPhysics3DWorlds = new WeakSet<Physics3DWorld>();
