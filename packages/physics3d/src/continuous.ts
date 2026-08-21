import {
  collideContactManifold3D,
  createCollisionContactManifold3D,
  createCollisionTimeOfImpact3D,
  sweepCollisionShape3D,
} from '@flighthq/collision/contract';
import type {
  CollisionContactManifold3D,
  CollisionTimeOfImpact3D,
  Physics3DWorld,
  RigidBody3D,
  SpatialPair,
} from '@flighthq/types/contract';

import { synchronizePhysics3DBroadphase, synchronizePhysics3DSweptBroadphase } from './broadphase';
import { updatePhysics3DColliderWorldShape } from './colliderTransform';
import { integrateRigidBody3DPose, refreshRigidBody3DWorldInertia } from './integrate';
import { isPhysics3DPairJointSuppressed } from './jointCollisionSuppression';
import { isPhysics3DPairOrdered } from './jointRegistry';
import { mixPhysics3DRestitution } from './material';
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
// which is the behaviour the caller would have had anyway.
export function integratePhysics3DContinuous(world: Physics3DWorld, dt: number): void {
  const scratch = acquirePhysics3DContinuousScratch();
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
  }
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

    const translationAX = isPhysics3DBodyMoving(bodyA) ? bodyA.velocityX * dt : 0;
    const translationAY = isPhysics3DBodyMoving(bodyA) ? bodyA.velocityY * dt : 0;
    const translationAZ = isPhysics3DBodyMoving(bodyA) ? bodyA.velocityZ * dt : 0;
    const translationBX = isPhysics3DBodyMoving(bodyB) ? bodyB.velocityX * dt : 0;
    const translationBY = isPhysics3DBodyMoving(bodyB) ? bodyB.velocityY * dt : 0;
    const translationBZ = isPhysics3DBodyMoving(bodyB) ? bodyB.velocityZ * dt : 0;

    for (let i = 0; i < bodyA.colliders.length; i += 1) {
      for (let j = 0; j < bodyB.colliders.length; j += 1) {
        const colliderA = bodyA.colliders[i];
        const colliderB = bodyB.colliders[j];
        // A sensor reports overlaps and resolves nothing, so stopping the world at one would halt a
        // bullet on a trigger volume it should fly straight through.
        if (colliderA.sensor || colliderB.sensor) continue;
        if (!isPhysics3DColliderPairEnabled(colliderA, colliderB)) continue;
        const angularTravelA = isPhysics3DBodyMoving(bodyA)
          ? Math.hypot(bodyA.angularVelocityX, bodyA.angularVelocityY, bodyA.angularVelocityZ) * dt
          : 0;
        const angularTravelB = isPhysics3DBodyMoving(bodyB)
          ? Math.hypot(bodyB.angularVelocityX, bodyB.angularVelocityY, bodyB.angularVelocityZ) * dt
          : 0;
        let candidate: CollisionTimeOfImpact3D | null = null;
        let rotational = false;
        // Preserve the analytic translation sweep even while the body spins. Replacing it with angular
        // samples would let a fast, slightly rotating bullet cross a thin wall between those samples.
        if (
          sweepCollisionShape3D(
            colliderA.world,
            translationAX,
            translationAY,
            translationAZ,
            colliderB.world,
            translationBX,
            translationBY,
            translationBZ,
            scratch.linearImpact,
            1,
          ) &&
          scratch.linearImpact.fraction > 0 &&
          isPhysics3DImpactApproaching(bodyA, bodyB, scratch.linearImpact)
        ) {
          candidate = scratch.linearImpact;
        }
        if (
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
          scratch.rotationalImpact.fraction > 0 &&
          (candidate === null || scratch.rotationalImpact.fraction < candidate.fraction) &&
          isPhysics3DRotationalImpactApproaching(bodyA, bodyB, scratch.rotationalManifold, scratch)
        ) {
          candidate = scratch.rotationalImpact;
          rotational = true;
        }
        if (candidate === null || candidate.fraction >= scratch.fraction) continue;

        scratch.fraction = candidate.fraction;
        scratch.bodyA = bodyA.index;
        scratch.bodyB = bodyB.index;
        scratch.normalX = candidate.normalX;
        scratch.normalY = candidate.normalY;
        scratch.normalZ = candidate.normalZ;
        scratch.restitution = mixPhysics3DRestitution(colliderA.material.restitution, colliderB.material.restitution);
        scratch.rotational = rotational;
        scratch.pointCount = rotational ? scratch.rotationalManifold.pointCount : 0;
        if (rotational) {
          for (let point = 0; point < scratch.pointCount; point += 1) {
            const source = scratch.rotationalManifold.points[point];
            const offset = point * 3;
            scratch.points[offset] = source.x;
            scratch.points[offset + 1] = source.y;
            scratch.points[offset + 2] = source.z;
          }
        }
      }
    }
  }

  return scratch.bodyA >= 0;
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
  const substeps = Math.min(maxSubsteps, Math.max(1, Math.ceil(angularTravel / CCD_ROTATION_INCREMENT)));
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
    const overlapping = collideContactManifold3D(colliderA.world, colliderB.world, scratch.rotationalManifold);
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
// So this arrests the approach and nothing else. The pair is left touching and awake, and the ORDINARY
// contact generation on the next step produces a real MANIFOLD — several points whose lever arms cancel
// for a square hit and do not for a glancing one — applying the torque, friction, and warm starting a
// rotating impact needs. What continuous collision has to guarantee is only that the body is still on the
// near side for that step to find it. Giving the impact its own angular response means giving it a
// manifold, not a better point.
function resolvePhysics3DImpact(world: Physics3DWorld, scratch: Physics3DContinuousScratch): void {
  const bodyA = world.bodyByIndex.get(scratch.bodyA);
  const bodyB = world.bodyByIndex.get(scratch.bodyB);
  if (bodyA === undefined || bodyB === undefined) return;

  wakePhysics3DImpactBody(bodyA);
  wakePhysics3DImpactBody(bodyB);

  if (scratch.rotational && scratch.pointCount > 0) {
    resolvePhysics3DRotationalImpact(world, bodyA, bodyB, scratch);
    return;
  }

  const approach = getRelativeNormalVelocity(bodyA, bodyB, scratch.normalX, scratch.normalY, scratch.normalZ);
  if (approach >= 0) return;

  const totalInverseMass = bodyA.inverseMass + bodyB.inverseMass;
  if (!(totalInverseMass > 0)) return;

  const restitution = approach < -world.config.sequentialImpulse.restitutionThreshold ? scratch.restitution : 0;
  const magnitude = (-(1 + restitution) * approach) / totalInverseMass;
  bodyA.velocityX += scratch.normalX * magnitude * bodyA.inverseMass;
  bodyA.velocityY += scratch.normalY * magnitude * bodyA.inverseMass;
  bodyA.velocityZ += scratch.normalZ * magnitude * bodyA.inverseMass;
  bodyB.velocityX -= scratch.normalX * magnitude * bodyB.inverseMass;
  bodyB.velocityY -= scratch.normalY * magnitude * bodyB.inverseMass;
  bodyB.velocityZ -= scratch.normalZ * magnitude * bodyB.inverseMass;
}

function resolvePhysics3DRotationalImpact(
  world: Readonly<Physics3DWorld>,
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  scratch: Physics3DContinuousScratch,
): void {
  writeRigidBody3DWorldCenter(bodyA, scratch.centerA);
  writeRigidBody3DWorldCenter(bodyB, scratch.centerB);
  for (let point = 0; point < scratch.pointCount; point += 1) {
    scratch.normalImpulses[point] = 0;
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
      approach < -world.config.sequentialImpulse.restitutionThreshold ? -scratch.restitution * approach : 0;
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
    }
  }
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
const CCD_ROTATION_INCREMENT = Math.PI / 180;
const CCD_ROTATION_BISECTION_ITERATIONS = 12;
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
  normalX: number;
  normalY: number;
  normalZ: number;
  restitution: number;
  rotational: boolean;
  rotationalManifold: CollisionContactManifold3D;
  pointCount: number;
  points: number[];
  normalImpulses: number[];
  velocityBiases: number[];
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
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    restitution: 0,
    rotational: false,
    rotationalManifold: createCollisionContactManifold3D(),
    pointCount: 0,
    points: new Array(12).fill(0),
    normalImpulses: new Array(4).fill(0),
    velocityBiases: new Array(4).fill(0),
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
