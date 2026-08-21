import { createCollisionTimeOfImpact3D, sweepCollisionShape3D } from '@flighthq/collision/contract';
import type { CollisionTimeOfImpact3D, Physics3DWorld, RigidBody3D, SpatialPair } from '@flighthq/types/contract';

import { synchronizePhysics3DBroadphase, synchronizePhysics3DSweptBroadphase } from './broadphase';
import { integrateRigidBody3DPose, refreshRigidBody3DWorldInertia } from './integrate';
import { isPhysics3DPairJointSuppressed } from './jointCollisionSuppression';
import { isPhysics3DPairOrdered } from './jointRegistry';
import { mixPhysics3DRestitution } from './material';

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
        if (
          !sweepCollisionShape3D(
            colliderA.world,
            translationAX,
            translationAY,
            translationAZ,
            colliderB.world,
            translationBX,
            translationBY,
            translationBZ,
            scratch.impact,
            1,
          )
        ) {
          continue;
        }
        if (scratch.impact.fraction >= scratch.fraction) continue;
        // A pair already touching at the start of the interval is the discrete solver's business, not
        // this one's: stopping time at fraction 0 would advance nothing and loop the substep budget away.
        if (scratch.impact.fraction <= 0) continue;
        if (!isPhysics3DImpactApproaching(bodyA, bodyB, scratch.impact)) continue;

        scratch.fraction = scratch.impact.fraction;
        scratch.bodyA = bodyA.index;
        scratch.bodyB = bodyB.index;
        scratch.normalX = scratch.impact.normalX;
        scratch.normalY = scratch.impact.normalY;
        scratch.normalZ = scratch.impact.normalZ;
        scratch.restitution = mixPhysics3DRestitution(colliderA.material.restitution, colliderB.material.restitution);
      }
    }
  }

  return scratch.bodyA >= 0;
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

  const approach = getRelativeNormalVelocity(bodyA, bodyB, scratch.normalX, scratch.normalY, scratch.normalZ);
  if (approach >= 0) return;

  const totalInverseMass = bodyA.inverseMass + bodyB.inverseMass;
  if (!(totalInverseMass > 0)) return;

  const magnitude = (-(1 + scratch.restitution) * approach) / totalInverseMass;
  bodyA.velocityX += scratch.normalX * magnitude * bodyA.inverseMass;
  bodyA.velocityY += scratch.normalY * magnitude * bodyA.inverseMass;
  bodyA.velocityZ += scratch.normalZ * magnitude * bodyA.inverseMass;
  bodyB.velocityX -= scratch.normalX * magnitude * bodyB.inverseMass;
  bodyB.velocityY -= scratch.normalY * magnitude * bodyB.inverseMass;
  bodyB.velocityZ -= scratch.normalZ * magnitude * bodyB.inverseMass;
}

function wakePhysics3DImpactBody(body: RigidBody3D): void {
  if (body.type === 'static') return;
  body.sleeping = false;
  body.sleepTimer = 0;
}

// Below this the pair is grazing rather than approaching, and stopping the world for it would halt a
// body that was never going to collide.
const APPROACH_EPSILON = 1e-9;

interface Physics3DContinuousScratch {
  pairs: SpatialPair[];
  impact: CollisionTimeOfImpact3D;
  fraction: number;
  bodyA: number;
  bodyB: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  restitution: number;
}

function acquirePhysics3DContinuousScratch(): Physics3DContinuousScratch {
  return physics3DContinuousScratchPool.pop() ?? createPhysics3DContinuousScratch();
}

function createPhysics3DContinuousScratch(): Physics3DContinuousScratch {
  return {
    pairs: [],
    impact: createCollisionTimeOfImpact3D(),
    fraction: 0,
    bodyA: -1,
    bodyB: -1,
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    restitution: 0,
  };
}

function releasePhysics3DContinuousScratch(scratch: Physics3DContinuousScratch): void {
  physics3DContinuousScratchPool.push(scratch);
}

const physics3DContinuousScratchPool: Physics3DContinuousScratch[] = [createPhysics3DContinuousScratch()];
