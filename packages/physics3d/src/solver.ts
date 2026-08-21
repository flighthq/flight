import { collideContactManifold3D, createCollisionContactManifold3D } from '@flighthq/collision/contract';
import type {
  CollisionContactManifold3D,
  Physics3DContactConstraint,
  Physics3DContactConstraintPoint,
  Physics3DWorld,
  RigidBody3D,
} from '@flighthq/types/contract';

import { updatePhysics3DColliderWorldShape } from './colliderTransform';
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

// Allocates one contact constraint with no points. The solver owns this record; nothing here belongs
// on `Physics3DContact`, which carries geometry and identity only.
export function createPhysics3DContactConstraint(): Physics3DContactConstraint {
  return {
    contact: -1,
    pointCount: 0,
    points: [],
    tangent0X: 0,
    tangent0Y: 0,
    tangent0Z: 0,
    tangent1X: 0,
    tangent1Y: 0,
    tangent1Z: 0,
  };
}

// Allocates one point's accumulators, zeroed. A fresh point warm-starts from nothing, which is the
// correct behaviour for a contact that did not exist last step.
export function createPhysics3DContactConstraintPoint(): Physics3DContactConstraintPoint {
  return {
    bias: 0,
    featureId: 0,
    normalImpulse: 0,
    normalMass: 0,
    tangentImpulse0: 0,
    tangentImpulse1: 0,
    tangentMass0: 0,
    tangentMass1: 0,
  };
}

// Rebuilds the solver's working set from the world's contact list and prepares every constraint row:
// the friction basis, the three effective masses, and the restitution bias.
//
// Call once per sub-interval, after `buildPhysics3DSolveIslands` and before
// `warmStartPhysics3DContacts`. The island order is a real precondition rather than a convention: this
// reads the island contact slices, so a world whose workspace was never built has no contacts to
// prepare and produces no constraints at all.
//
// Two things happen here that cannot happen anywhere else. The restitution bias is captured from the
// approach speed BEFORE any impulse is applied — once the first iteration runs, the velocity it would
// be read from has already been changed by the solve, and restitution computed from it decays toward
// zero. And the accumulators are matched to last step's by `featureId` rather than by point index,
// because a narrow phase may report the same physical corner at a different index between steps, and
// warm starting the wrong corner is worse than not warm starting at all.
//
// Contacts that are disabled, sensors, non-touching, asleep, or between two bodies that both have
// infinite mass produce no constraint: they are skipped rather than emitted with zero rows, so the
// iteration loops never see work that cannot move anything.
//
// The disabled, sensor, and sleeping ones are already gone before this runs, because the iteration is
// over the SOLVE ISLAND contact slices rather than `world.contacts`. That is what makes a settled world
// cost nothing here: a sleeping island contributes no slice, so a thousand-body pile at rest is not
// re-scanned every sub-interval merely to discover there is nothing to do. It also groups the emitted
// constraints island-major, which disconnected islands cannot perturb for each other.
//
// The remaining velocity and position passes stay global over the emitted list rather than looping per
// island. With a fixed iteration count and no convergence test the two are the same work in the same
// order — islands are disconnected, so interleaving them cannot change a result — and the flat list is
// what lets joints and contacts share one interleaved pass.
export function preparePhysics3DContactConstraints(world: Physics3DWorld): void {
  const state = world.solver;
  const previousByContact = state.constraintByContact;
  const constraints = state.constraints;
  // `contact = -1` is the inactive mark while the same high-water objects are gathered back into solve
  // order. The map cannot be cleared first because it is also how the contact finds its prior impulses.
  for (const constraint of constraints) constraint.contact = -1;
  constraints.length = 0;
  const config = world.config.sequentialImpulse;

  for (let island = 0; island < world.solveIslandRoots.length; island += 1) {
    const islandStart = world.solveIslandContactStarts[island];
    const islandEnd = islandStart + world.solveIslandContactCounts[island];
    for (let at = islandStart; at < islandEnd; at += 1) {
      const contactIndex = world.solveIslandContactIndices[at];
      const contact = world.contacts[contactIndex];
      if (!contact.touching || contact.pointCount === 0) continue;

      const bodyA = world.bodyByIndex.get(contact.bodyA);
      const bodyB = world.bodyByIndex.get(contact.bodyB);
      if (bodyA === undefined || bodyB === undefined) continue;
      if (
        bodyA.inverseMass === 0 &&
        bodyB.inverseMass === 0 &&
        !hasRotationalFreedom(bodyA) &&
        !hasRotationalFreedom(bodyB)
      ) {
        continue;
      }

      let constraint = previousByContact.get(contact);
      if (constraint === undefined) {
        constraint = createPhysics3DContactConstraint();
        previousByContact.set(contact, constraint);
      }
      const previousPointCount = constraint.pointCount;
      for (let i = 0; i < previousPointCount; i += 1) {
        const point = constraint.points[i];
        previousFeatures[i] = point.featureId;
        previousNormalImpulses[i] = point.normalImpulse;
        previousTangentImpulses0[i] = point.tangentImpulse0;
        previousTangentImpulses1[i] = point.tangentImpulse1;
      }
      constraint.contact = contactIndex;
      constraint.pointCount = contact.pointCount;
      writeFrictionBasis(contact.normalX, contact.normalY, contact.normalZ, constraint);

      for (let i = 0; i < contact.pointCount; i += 1) {
        const source = contact.points[i];
        let point = constraint.points[i];
        if (point === undefined) {
          point = createPhysics3DContactConstraintPoint();
          constraint.points.push(point);
        }
        point.featureId = source.featureId;
        point.normalImpulse = 0;
        point.tangentImpulse0 = 0;
        point.tangentImpulse1 = 0;

        if (config.warmStarting) {
          const carried = findPreviousPointByFeatureId(source.featureId, previousPointCount);
          if (carried >= 0) {
            point.normalImpulse = previousNormalImpulses[carried];
            point.tangentImpulse0 = previousTangentImpulses0[carried];
            point.tangentImpulse1 = previousTangentImpulses1[carried];
          }
        }

        point.normalMass = getEffectiveMass(
          bodyA,
          bodyB,
          source.rAX,
          source.rAY,
          source.rAZ,
          source.rBX,
          source.rBY,
          source.rBZ,
          contact.normalX,
          contact.normalY,
          contact.normalZ,
        );
        point.tangentMass0 = getEffectiveMass(
          bodyA,
          bodyB,
          source.rAX,
          source.rAY,
          source.rAZ,
          source.rBX,
          source.rBY,
          source.rBZ,
          constraint.tangent0X,
          constraint.tangent0Y,
          constraint.tangent0Z,
        );
        point.tangentMass1 = getEffectiveMass(
          bodyA,
          bodyB,
          source.rAX,
          source.rAY,
          source.rAZ,
          source.rBX,
          source.rBY,
          source.rBZ,
          constraint.tangent1X,
          constraint.tangent1Y,
          constraint.tangent1Z,
        );

        const approach = getRelativeNormalVelocity(
          bodyA,
          bodyB,
          source.rAX,
          source.rAY,
          source.rAZ,
          source.rBX,
          source.rBY,
          source.rBZ,
          contact.normalX,
          contact.normalY,
          contact.normalZ,
        );
        point.bias = approach < -config.restitutionThreshold ? -contact.restitution * approach : 0;
      }

      constraints.push(constraint);
    }
  }

  // Retire constraints whose contacts were omitted from the awake solve without replacing the map.
  // Deleting while iterating a Map is defined to leave the remaining entries visitable.
  for (const [contact, constraint] of previousByContact) {
    if (constraint.contact < 0) previousByContact.delete(contact);
  }
}

// Resolves penetration by moving bodies directly, leaving `penetrationSlop` of overlap deliberately
// unresolved so resting bodies do not twitch against a target of exactly zero. Returns the deepest
// remaining penetration, so a caller can stop iterating once the stack is within tolerance.
//
// This is a separate pass from the velocity solve on purpose: correcting overlap by adding separating
// velocity injects energy the simulation never spent, and a deep stack resolved that way visibly
// launches itself apart.
//
// EACH CONTACT IS REGENERATED IMMEDIATELY BEFORE IT IS SOLVED, which is what makes this a true
// non-linear Gauss-Seidel pass rather than a repeated correction against one stale measurement.
//
// That distinction is the whole quality of a stack. An earlier correction in the same pass has already
// moved one or both bodies, so the depth captured at intake describes a configuration that no longer
// exists — and re-applying `positionCorrection * staleDepth` on every iteration cannot converge, because
// the quantity it is driving to zero never changes. The visible symptom is penetration that grows with
// stack HEIGHT while every single-contact test still passes: a twelve-box pile measured 0.23 of sink at
// its base against 0.005 for one box, and correcting from current geometry removes it.
//
// The manifold is leased scratch, so the pass allocates nothing.
export function solvePhysics3DContactPositions(world: Physics3DWorld): number {
  const scratch = acquirePhysics3DPositionScratch();
  try {
    return solvePhysics3DContactPositionsWithScratch(world, scratch);
  } finally {
    releasePhysics3DPositionScratch(scratch);
  }
}

function solvePhysics3DContactPositionsWithScratch(world: Physics3DWorld, scratch: Physics3DPositionScratch): number {
  const config = world.config.sequentialImpulse;
  let deepest = 0;

  for (const constraint of world.solver.constraints) {
    const contact = world.contacts[constraint.contact];
    const bodyA = world.bodyByIndex.get(contact.bodyA);
    const bodyB = world.bodyByIndex.get(contact.bodyB);
    if (bodyA === undefined || bodyB === undefined) continue;

    const colliderA = bodyA.colliders[contact.colliderA];
    const colliderB = bodyB.colliders[contact.colliderB];
    if (colliderA === undefined || colliderB === undefined) continue;
    updatePhysics3DColliderWorldShape(colliderA, bodyA);
    updatePhysics3DColliderWorldShape(colliderB, bodyB);
    if (!collideContactManifold3D(colliderA.world, colliderB.world, scratch.manifold)) continue;

    const manifold = scratch.manifold;
    writeRigidBody3DWorldCenter(bodyA, scratch.centerA);
    writeRigidBody3DWorldCenter(bodyB, scratch.centerB);

    for (let i = 0; i < manifold.pointCount; i += 1) {
      const source = manifold.points[i];
      const excess = source.depth - config.penetrationSlop;
      if (excess > deepest) deepest = excess;
      if (excess <= 0) continue;

      // Lever arms from the CURRENT centres to the CURRENT contact point, for the same reason the
      // manifold is regenerated: an arm measured against a pose two corrections ago applies its torque
      // about the wrong axis.
      const rAX = source.x - scratch.centerA[0];
      const rAY = source.y - scratch.centerA[1];
      const rAZ = source.z - scratch.centerA[2];
      const rBX = source.x - scratch.centerB[0];
      const rBY = source.y - scratch.centerB[1];
      const rBZ = source.z - scratch.centerB[2];
      const mass = getEffectiveMass(
        bodyA,
        bodyB,
        rAX,
        rAY,
        rAZ,
        rBX,
        rBY,
        rBZ,
        manifold.normalX,
        manifold.normalY,
        manifold.normalZ,
      );

      const correction = config.positionCorrection * excess * mass;
      applyPositionCorrection(
        bodyA,
        bodyB,
        rAX,
        rAY,
        rAZ,
        rBX,
        rBY,
        rBZ,
        manifold.normalX * correction,
        manifold.normalY * correction,
        manifold.normalZ * correction,
      );
    }
  }

  return deepest;
}

// Runs one velocity iteration over every prepared constraint. Call `velocityIterations` times.
//
// The normal is solved before friction, so a NEW contact has a Coulomb limit in its first iteration.
// Reversing them makes friction read the previous normal impulse: zero on first impact, and one
// iteration behind thereafter. The two tangents are clamped TOGETHER as a cone rather than
// independently. Clamping each to `friction * normalImpulse` on its own admits a combined
// magnitude of `sqrt(2) * friction * normalImpulse` along the diagonal, which presents as a box that
// slides measurably faster at 45 degrees than it does along either tangent — a bug that looks like bad
// friction tuning rather than like a geometry error, and one that cannot occur in 2D because there is
// only one tangent to clamp.
export function solvePhysics3DContactVelocities(world: Physics3DWorld): void {
  for (const constraint of world.solver.constraints) {
    const contact = world.contacts[constraint.contact];
    const bodyA = world.bodyByIndex.get(contact.bodyA);
    const bodyB = world.bodyByIndex.get(contact.bodyB);
    if (bodyA === undefined || bodyB === undefined) continue;

    for (let i = 0; i < constraint.pointCount; i += 1) {
      const source = contact.points[i];
      const point = constraint.points[i];

      const normalVelocity = getRelativeNormalVelocity(
        bodyA,
        bodyB,
        source.rAX,
        source.rAY,
        source.rAZ,
        source.rBX,
        source.rBY,
        source.rBZ,
        contact.normalX,
        contact.normalY,
        contact.normalZ,
      );
      const normalImpulse = Math.max(point.normalImpulse + (point.bias - normalVelocity) * point.normalMass, 0);
      const deltaNormal = normalImpulse - point.normalImpulse;
      point.normalImpulse = normalImpulse;

      applyContactImpulse(
        bodyA,
        bodyB,
        source.rAX,
        source.rAY,
        source.rAZ,
        source.rBX,
        source.rBY,
        source.rBZ,
        contact.normalX * deltaNormal,
        contact.normalY * deltaNormal,
        contact.normalZ * deltaNormal,
      );

      const maxFriction = contact.friction * point.normalImpulse;

      const tangentVelocity0 = getRelativeNormalVelocity(
        bodyA,
        bodyB,
        source.rAX,
        source.rAY,
        source.rAZ,
        source.rBX,
        source.rBY,
        source.rBZ,
        constraint.tangent0X,
        constraint.tangent0Y,
        constraint.tangent0Z,
      );
      let impulse0 = point.tangentImpulse0 - tangentVelocity0 * point.tangentMass0;

      const tangentVelocity1 = getRelativeNormalVelocity(
        bodyA,
        bodyB,
        source.rAX,
        source.rAY,
        source.rAZ,
        source.rBX,
        source.rBY,
        source.rBZ,
        constraint.tangent1X,
        constraint.tangent1Y,
        constraint.tangent1Z,
      );
      let impulse1 = point.tangentImpulse1 - tangentVelocity1 * point.tangentMass1;

      const magnitude = Math.sqrt(impulse0 * impulse0 + impulse1 * impulse1);
      if (magnitude > maxFriction) {
        const scale = maxFriction / magnitude;
        impulse0 *= scale;
        impulse1 *= scale;
      }

      const deltaTangent0 = impulse0 - point.tangentImpulse0;
      const deltaTangent1 = impulse1 - point.tangentImpulse1;
      point.tangentImpulse0 = impulse0;
      point.tangentImpulse1 = impulse1;

      applyContactImpulse(
        bodyA,
        bodyB,
        source.rAX,
        source.rAY,
        source.rAZ,
        source.rBX,
        source.rBY,
        source.rBZ,
        constraint.tangent0X * deltaTangent0 + constraint.tangent1X * deltaTangent1,
        constraint.tangent0Y * deltaTangent0 + constraint.tangent1Y * deltaTangent1,
        constraint.tangent0Z * deltaTangent0 + constraint.tangent1Z * deltaTangent1,
      );
    }
  }
}

// Replays the accumulated impulses carried over from last step, so the solver starts an iteration
// budget from roughly the answer it converged to rather than from zero. A stack solved cold every step
// sinks visibly under its own weight at any practical iteration count.
//
// Runs after `preparePhysics3DContactConstraints` and before the first velocity iteration.
export function warmStartPhysics3DContacts(world: Physics3DWorld): void {
  if (!world.config.sequentialImpulse.warmStarting) return;

  for (const constraint of world.solver.constraints) {
    const contact = world.contacts[constraint.contact];
    const bodyA = world.bodyByIndex.get(contact.bodyA);
    const bodyB = world.bodyByIndex.get(contact.bodyB);
    if (bodyA === undefined || bodyB === undefined) continue;

    for (let i = 0; i < constraint.pointCount; i += 1) {
      const source = contact.points[i];
      const point = constraint.points[i];
      applyContactImpulse(
        bodyA,
        bodyB,
        source.rAX,
        source.rAY,
        source.rAZ,
        source.rBX,
        source.rBY,
        source.rBZ,
        contact.normalX * point.normalImpulse +
          constraint.tangent0X * point.tangentImpulse0 +
          constraint.tangent1X * point.tangentImpulse1,
        contact.normalY * point.normalImpulse +
          constraint.tangent0Y * point.tangentImpulse0 +
          constraint.tangent1Y * point.tangentImpulse1,
        contact.normalZ * point.normalImpulse +
          constraint.tangent0Z * point.tangentImpulse0 +
          constraint.tangent1Z * point.tangentImpulse1,
      );
    }
  }
}

// Applies an equal and opposite impulse at the contact: A gains it, B loses it. The contact normal
// points out of B, so a positive normal impulse separates the pair.
function applyContactImpulse(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  rAX: number,
  rAY: number,
  rAZ: number,
  rBX: number,
  rBY: number,
  rBZ: number,
  impulseX: number,
  impulseY: number,
  impulseZ: number,
): void {
  applyBodyImpulse(bodyA, rAX, rAY, rAZ, impulseX, impulseY, impulseZ);
  applyBodyImpulse(bodyB, rBX, rBY, rBZ, -impulseX, -impulseY, -impulseZ);
}

// A static body's zero inverse mass and zero inverse inertia make this a no-op with no branch, which is
// the whole reason infinite mass is represented as a zero inverse rather than as a flag.
function applyBodyImpulse(
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

  readWorldInverseInertia(body, scratchTensor);
  applySymmetricTensor(scratchTensor, torqueX, torqueY, torqueZ, scratchVector);
  body.angularVelocityX += scratchVector[0];
  body.angularVelocityY += scratchVector[1];
  body.angularVelocityZ += scratchVector[2];
}

// Moves both bodies apart along an already-scaled correction vector, rotating each about its centre of
// mass by the same lever-arm term the velocity solve uses. Orientation is nudged by the small-angle
// quaternion update and renormalized, exactly as pose integration does.
function applyPositionCorrection(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  rAX: number,
  rAY: number,
  rAZ: number,
  rBX: number,
  rBY: number,
  rBZ: number,
  correctionX: number,
  correctionY: number,
  correctionZ: number,
): void {
  applyBodyPositionCorrection(bodyA, rAX, rAY, rAZ, correctionX, correctionY, correctionZ);
  applyBodyPositionCorrection(bodyB, rBX, rBY, rBZ, -correctionX, -correctionY, -correctionZ);
}

function applyBodyPositionCorrection(
  body: RigidBody3D,
  rX: number,
  rY: number,
  rZ: number,
  correctionX: number,
  correctionY: number,
  correctionZ: number,
): void {
  body.x += correctionX * body.inverseMass;
  body.y += correctionY * body.inverseMass;
  body.z += correctionZ * body.inverseMass;

  const turnX = rY * correctionZ - rZ * correctionY;
  const turnY = rZ * correctionX - rX * correctionZ;
  const turnZ = rX * correctionY - rY * correctionX;

  readWorldInverseInertia(body, scratchTensor);
  applySymmetricTensor(scratchTensor, turnX, turnY, turnZ, scratchVector);

  const angleX = scratchVector[0];
  const angleY = scratchVector[1];
  const angleZ = scratchVector[2];
  if (angleX === 0 && angleY === 0 && angleZ === 0) return;

  const qx = body.orientationX;
  const qy = body.orientationY;
  const qz = body.orientationZ;
  const qw = body.orientationW;

  let nextX = qx + 0.5 * (angleX * qw + angleY * qz - angleZ * qy);
  let nextY = qy + 0.5 * (angleY * qw + angleZ * qx - angleX * qz);
  let nextZ = qz + 0.5 * (angleZ * qw + angleX * qy - angleY * qx);
  let nextW = qw - 0.5 * (angleX * qx + angleY * qy + angleZ * qz);

  const length = Math.sqrt(nextX * nextX + nextY * nextY + nextZ * nextZ + nextW * nextW);
  if (length === 0) return;
  const inverseLength = 1 / length;
  nextX *= inverseLength;
  nextY *= inverseLength;
  nextZ *= inverseLength;
  nextW *= inverseLength;

  body.orientationX = nextX;
  body.orientationY = nextY;
  body.orientationZ = nextZ;
  body.orientationW = nextW;
}

// Locates last step's accumulators for a feature. Linear because a manifold holds at most a handful of
// points and a map per contact would cost more than the scan.
function findPreviousPointByFeatureId(featureId: number, pointCount: number): number {
  for (let i = 0; i < pointCount; i += 1) {
    if (previousFeatures[i] === featureId) return i;
  }
  return -1;
}

// The constraint denominator along one direction: the scalar mass a unit impulse in that direction
// acts against, including both bodies' resistance to being spun about the contact.
//
// Returns 0 when the pair cannot move along the direction at all, so the impulse computed from it is
// zero rather than infinite.
function getEffectiveMass(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  rAX: number,
  rAY: number,
  rAZ: number,
  rBX: number,
  rBY: number,
  rBZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
): number {
  let denominator = bodyA.inverseMass + bodyB.inverseMass;

  const crossAX = rAY * directionZ - rAZ * directionY;
  const crossAY = rAZ * directionX - rAX * directionZ;
  const crossAZ = rAX * directionY - rAY * directionX;
  readWorldInverseInertia(bodyA, scratchTensor);
  applySymmetricTensor(scratchTensor, crossAX, crossAY, crossAZ, scratchVector);
  denominator += crossAX * scratchVector[0] + crossAY * scratchVector[1] + crossAZ * scratchVector[2];

  const crossBX = rBY * directionZ - rBZ * directionY;
  const crossBY = rBZ * directionX - rBX * directionZ;
  const crossBZ = rBX * directionY - rBY * directionX;
  readWorldInverseInertia(bodyB, scratchTensor);
  applySymmetricTensor(scratchTensor, crossBX, crossBY, crossBZ, scratchVector);
  denominator += crossBX * scratchVector[0] + crossBY * scratchVector[1] + crossBZ * scratchVector[2];

  return denominator > 0 ? 1 / denominator : 0;
}

// The closing speed of the two contact points along a direction, positive when they separate. Each
// point's velocity is its body's linear velocity plus the rotational contribution at its lever arm,
// which is the term that makes a spinning body's surface move even when its centre is still.
function getRelativeNormalVelocity(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  rAX: number,
  rAY: number,
  rAZ: number,
  rBX: number,
  rBY: number,
  rBZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
): number {
  const pointAX = bodyA.velocityX + (bodyA.angularVelocityY * rAZ - bodyA.angularVelocityZ * rAY);
  const pointAY = bodyA.velocityY + (bodyA.angularVelocityZ * rAX - bodyA.angularVelocityX * rAZ);
  const pointAZ = bodyA.velocityZ + (bodyA.angularVelocityX * rAY - bodyA.angularVelocityY * rAX);

  const pointBX = bodyB.velocityX + (bodyB.angularVelocityY * rBZ - bodyB.angularVelocityZ * rBY);
  const pointBY = bodyB.velocityY + (bodyB.angularVelocityZ * rBX - bodyB.angularVelocityX * rBZ);
  const pointBZ = bodyB.velocityZ + (bodyB.angularVelocityX * rBY - bodyB.angularVelocityY * rBX);

  return (pointAX - pointBX) * directionX + (pointAY - pointBY) * directionY + (pointAZ - pointBZ) * directionZ;
}

function hasRotationalFreedom(body: Readonly<RigidBody3D>): boolean {
  return (
    body.inverseInertiaWorldXX !== 0 ||
    body.inverseInertiaWorldYY !== 0 ||
    body.inverseInertiaWorldZZ !== 0 ||
    body.inverseInertiaWorldXY !== 0 ||
    body.inverseInertiaWorldXZ !== 0 ||
    body.inverseInertiaWorldYZ !== 0
  );
}

function readWorldInverseInertia(body: Readonly<RigidBody3D>, out: number[]): void {
  out[TENSOR_XX] = body.inverseInertiaWorldXX;
  out[TENSOR_YY] = body.inverseInertiaWorldYY;
  out[TENSOR_ZZ] = body.inverseInertiaWorldZZ;
  out[TENSOR_XY] = body.inverseInertiaWorldXY;
  out[TENSOR_XZ] = body.inverseInertiaWorldXZ;
  out[TENSOR_YZ] = body.inverseInertiaWorldYZ;
}

// Builds an orthonormal pair spanning the plane orthogonal to the contact normal. The seed axis is
// whichever principal axis the normal leans on least, so the cross product is never near-degenerate:
// a normal within 1/sqrt(3) of x leans on x least often, and that threshold is exactly where the
// choice flips.
function writeFrictionBasis(normalX: number, normalY: number, normalZ: number, out: Physics3DContactConstraint): void {
  let seedX = 0;
  let seedY = 0;
  let seedZ = 0;
  if (Math.abs(normalX) < AXIS_SELECTION_THRESHOLD) seedX = 1;
  else if (Math.abs(normalY) < AXIS_SELECTION_THRESHOLD) seedY = 1;
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

const AXIS_SELECTION_THRESHOLD = 0.5773502691896258;
const scratchTensor = [0, 0, 0, 0, 0, 0];
const scratchVector = [0, 0, 0];
const previousFeatures: number[] = [];
const previousNormalImpulses: number[] = [];
const previousTangentImpulses0: number[] = [];
const previousTangentImpulses1: number[] = [];

interface Physics3DPositionScratch {
  manifold: CollisionContactManifold3D;
  centerA: number[];
  centerB: number[];
}

function acquirePhysics3DPositionScratch(): Physics3DPositionScratch {
  return physics3DPositionScratchPool.pop() ?? createPhysics3DPositionScratch();
}

function createPhysics3DPositionScratch(): Physics3DPositionScratch {
  return { manifold: createCollisionContactManifold3D(), centerA: [0, 0, 0], centerB: [0, 0, 0] };
}

function releasePhysics3DPositionScratch(scratch: Physics3DPositionScratch): void {
  physics3DPositionScratchPool.push(scratch);
}

const physics3DPositionScratchPool: Physics3DPositionScratch[] = [createPhysics3DPositionScratch()];
