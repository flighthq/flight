import {
  collideContactManifold2D,
  createCollisionContactManifold2D,
  createCollisionTimeOfImpact2D,
  getCollisionShapeContainsPoint2D,
  testSegmentAabbCollision2D,
  testSegmentCircleCollision2D,
  testSegmentObbCollision2D,
  testSegmentPolygonCollision2D,
  testSegmentSegmentCollision2D,
  sweepCollisionShape2D,
} from '@flighthq/collision/contract';
import type {
  Physics2DJointResolutionGuard,
  Physics2DStepGuard,
  CollisionContactManifold2D,
  CollisionSegment2D,
  CollisionBuiltInShape2D,
  CollisionTimeOfImpact2D,
  Physics2DContact,
  Physics2DContactPoint,
  Physics2DWorld,
  RigidBody2D,
  SpatialPair,
} from '@flighthq/types/contract';

import { synchronizePhysics2DBroadphase, synchronizePhysics2DSweptBroadphase } from './broadphase';
import { updatePhysics2DColliderWorldShape } from './colliderTransform';
import { buildPhysics2DSolveIslands, isRigidBody2DPairAwake, updatePhysics2DSleep } from './islands';
import { isPhysics2DPairJointSuppressed } from './jointCollisionSuppression';
import { mixPhysics2DFriction, mixPhysics2DRestitution } from './material';
import { steppingPhysics2DWorlds } from './ownership';
import {
  applyPhysics2DImpulse,
  relativeNormalVelocity,
  solvePhysics2DContactIndicesOnce,
  warmStartPhysics2DContactIndices,
} from './solver';
import {
  isPhysics2DBodyStateValid,
  isPhysics2DContactValid,
  isPhysics2DContactStateValid,
  isPhysics2DGravityValid,
  isPhysics2DJointStateValid,
  isPhysics2DPreviousTimestepValid,
  isPhysics2DSolverConfigValid,
  isPhysics2DTimestepValid,
} from './stepValidation';
import { findPhysics2DBody, isPhysics2DPairOrdered } from './world';

// Builds this step's contact set from the broadphase pairs, preserving each surviving contact's cached
// impulses.
//
// TWO ORDERINGS ARE ENFORCED HERE, and they are different obligations:
//
//   1. Each PAIR is ordered by body index before the narrow phase is called, because collision resolves
//      contact points on the reference shape and ties toward its first argument. Reversed arguments move
//      the points and renumber their feature ids, which discards the warm-start cache.
//   2. The contact LIST is sorted, because a sequential-impulse solver is order-dependent by
//      construction — each impulse is applied against the velocities the previous ones left behind — and
//      `querySpatialPairs2D` walks a Map of Sets, so its order follows insertion and movement history.
//
// Neither substitutes for the other: the first fixes contact identity, the second fixes solve order.
// A determinism harness that shuffles only insertion order would pass with the first one broken.
function buildPhysics2DContacts(world: Physics2DWorld): void {
  world.index.querySpatialPairs(getPhysics2DStepScratch().pairs);

  world.events.began.length = 0;
  world.events.ended.length = 0;
  for (const contact of world.contacts) contact.touching = false;

  for (const pair of getPhysics2DStepScratch().pairs) {
    const first = findPhysics2DBody(world, pair.a);
    const second = findPhysics2DBody(world, pair.b);
    if (first === null || second === null) continue;
    // Two bodies that cannot both move have no constraint to SOLVE, and skipping them keeps the
    // solver's body list free of pairs whose every impulse would be multiplied by zero. But a sensor
    // is reported, never resolved — the solver already skips sensor contacts — so applying this test
    // before any collider is inspected silently deleted every sensor overlap between two immovable
    // bodies. A static trigger volume over static scenery is an ordinary thing to build, and it
    // reported nothing at all. Immovable pairs are still skipped, unless one of them senses.
    const bothImmovable = first.inverseMass === 0 && second.inverseMass === 0;
    if (bothImmovable && !hasSensorCollider(first) && !hasSensorCollider(second)) {
      continue;
    }
    // A jointed pair almost always overlaps at the anchor, and resolving that contact fights the
    // constraint holding them together, so a joint suppresses it unless the caller asks otherwise.
    if (isPhysics2DPairJointSuppressed(world, first.index, second.index)) continue;

    const ordered = isPhysics2DPairOrdered(first, second);
    const bodyA = ordered ? first : second;
    const bodyB = ordered ? second : first;

    for (let i = 0; i < bodyA.colliders.length; i++) {
      for (let j = 0; j < bodyB.colliders.length; j++) {
        const colliderA = bodyA.colliders[i];
        const colliderB = bodyB.colliders[j];
        if (!isPhysics2DColliderPairEnabled(colliderA, colliderB)) continue;
        const sensorPair = colliderA.sensor || colliderB.sensor;
        // The immovable test belongs here, not on the bodies. Owning one sensor anywhere does not make
        // a body's other colliders reportable: a static body carrying a trigger volume plus ordinary
        // scenery would otherwise emit solid-vs-solid contacts against other static scenery, which
        // nothing can ever resolve. Sensors are reported and never resolved, so a sensor pair is the
        // only pair worth keeping between two bodies that cannot move.
        if (bothImmovable && !sensorPair) continue;
        const manifold = collideContactManifold2D(colliderA.world, colliderB.world, getPhysics2DStepScratch().manifold);
        if (!manifold && (!sensorPair || !testPhysics2DAreaLessSensorOverlap(colliderA.world, colliderB.world))) {
          continue;
        }
        mergePhysics2DContact(
          world,
          bodyA.index,
          bodyB.index,
          i,
          j,
          getPhysics2DStepScratch().manifold,
          sensorPair,
          mixPhysics2DFriction(colliderA.material.friction, colliderB.material.friction),
          mixPhysics2DRestitution(colliderA.material.restitution, colliderB.material.restitution),
        );
      }
    }
  }

  // Contact events are read off the cache's own transitions rather than tracked beside it: the cache
  // already knows which pairs are touching, so a pair gaining an entry IS the begin and losing one IS the
  // end. An ended contact is reported for the step it leaves, then dropped.
  for (let i = world.contacts.length - 1; i >= 0; i--) {
    const contact = world.contacts[i];
    if (!contact.touching) {
      world.events.ended.push(contact);
      world.contacts.splice(i, 1);
    }
  }

  world.contacts.sort(comparePhysics2DContacts);
}

// Area-less shapes deliberately carry no contact manifold: there is no penetration depth or separating
// normal for the impulse solver to consume. A sensor needs only a boolean overlap, though, so it can use
// collision's exact point-containment and segment-query lanes and persist a zero-point contact solely for
// begin/end lifecycle. This fallback is sensor-only; a solid segment remains non-resolving by design.
function testPhysics2DAreaLessSensorOverlap(
  a: Readonly<CollisionBuiltInShape2D>,
  b: Readonly<CollisionBuiltInShape2D>,
): boolean {
  if (a.kind === 'point') return getCollisionShapeContainsPoint2D(b, a.x, a.y);
  if (b.kind === 'point') return getCollisionShapeContainsPoint2D(a, b.x, b.y);
  if (a.kind === 'segment') return testPhysics2DSegmentOverlap(a, b);
  if (b.kind === 'segment') return testPhysics2DSegmentOverlap(b, a);
  return false;
}

function testPhysics2DSegmentOverlap(
  segment: Readonly<CollisionSegment2D & { kind: 'segment' }>,
  other: Readonly<CollisionBuiltInShape2D>,
): boolean {
  switch (other.kind) {
    case 'aabb':
      return testSegmentAabbCollision2D(segment, other);
    case 'circle':
      return testSegmentCircleCollision2D(segment, other);
    case 'obb':
      return testSegmentObbCollision2D(segment, other);
    case 'polygon':
      return testSegmentPolygonCollision2D(segment, other);
    case 'segment':
      return testSegmentSegmentCollision2D(segment, other);
    case 'point':
      return getCollisionShapeContainsPoint2D(segment, other.x, other.y);
  }
}

function isPhysics2DColliderPairEnabled(
  colliderA: Readonly<RigidBody2D['colliders'][number]>,
  colliderB: Readonly<RigidBody2D['colliders'][number]>,
): boolean {
  // The fallback keeps worlds deserialized before filters were added safe to step; constructor-created
  // colliders always own an explicit filter and therefore never take this branch.
  const filterA = colliderA.filter ?? defaultCollisionFilter;
  const filterB = colliderB.filter ?? defaultCollisionFilter;
  if (filterA.groupIndex !== 0 && filterA.groupIndex === filterB.groupIndex) return filterA.groupIndex > 0;
  return (filterA.maskBits & filterB.categoryBits) !== 0 && (filterB.maskBits & filterA.categoryBits) !== 0;
}

// Writes this step's manifold into the persistent contact for the pair, creating it if new, and carries
// each point's converged impulses across by FEATURE ID rather than by slot. Matching by slot would hand
// a point the impulse of whatever happened to occupy that array position last step, which is a different
// contact feature the moment the manifold's point count or order changes.
function mergePhysics2DContact(
  world: Physics2DWorld,
  bodyA: number,
  bodyB: number,
  colliderA: number,
  colliderB: number,
  manifold: Readonly<CollisionContactManifold2D>,
  sensor: boolean,
  friction: number,
  restitution: number,
): Physics2DContact {
  let contact: Physics2DContact | null = null;
  let created = false;
  for (const existing of world.contacts) {
    if (
      existing.bodyA === bodyA &&
      existing.bodyB === bodyB &&
      existing.colliderA === colliderA &&
      existing.colliderB === colliderB
    ) {
      contact = existing;
      break;
    }
  }

  if (contact === null) {
    created = true;
    contact = {
      bodyA,
      bodyB,
      colliderA,
      colliderB,
      normalX: 0,
      normalY: 0,
      pointCount: 0,
      points: [createPhysics2DContactPoint(), createPhysics2DContactPoint()],
      friction,
      restitution,
      enabled: true,
      sensor,
      touching: true,
    };
    world.contacts.push(contact);
  }
  if (created) world.events.began.push(contact);

  contact.normalX = manifold.normalX;
  contact.normalY = manifold.normalY;
  contact.friction = friction;
  contact.restitution = restitution;
  contact.enabled = true;
  contact.sensor = sensor;
  contact.touching = true;

  // Snapshot the complete two-point cache before overwriting either destination. A manifold can return
  // the same two feature ids in the opposite slot order as the bodies move. Searching `contact.points`
  // while writing it in place makes the first write destroy evidence the second search needs, so one
  // feature silently cold-starts exactly when stable identity should preserve it.
  const oldPointCount = contact.pointCount;
  const oldFeature0 = oldPointCount > 0 ? contact.points[0].featureId : -1;
  const oldNormal0 = oldPointCount > 0 ? contact.points[0].normalImpulse : 0;
  const oldTangent0 = oldPointCount > 0 ? contact.points[0].tangentImpulse : 0;
  const oldFeature1 = oldPointCount > 1 ? contact.points[1].featureId : -1;
  const oldNormal1 = oldPointCount > 1 ? contact.points[1].normalImpulse : 0;
  const oldTangent1 = oldPointCount > 1 ? contact.points[1].tangentImpulse : 0;
  for (let i = 0; i < manifold.pointCount; i++) {
    const source = manifold.points[i];
    const target = contact.points[i];
    let normalImpulse = 0;
    let tangentImpulse = 0;
    if (oldPointCount > 0 && oldFeature0 === source.featureId) {
      normalImpulse = oldNormal0;
      tangentImpulse = oldTangent0;
    } else if (oldPointCount > 1 && oldFeature1 === source.featureId) {
      normalImpulse = oldNormal1;
      tangentImpulse = oldTangent1;
    }
    target.x = source.x;
    target.y = source.y;
    target.depth = source.depth;
    target.featureId = source.featureId;
    target.normalImpulse = normalImpulse;
    target.tangentImpulse = tangentImpulse;
  }
  contact.pointCount = manifold.pointCount;
  return contact;
}

// Rebuilds every contact's lever arms, effective masses, and velocity bias for this step's geometry.
// These are recomputed rather than cached because they depend on the bodies' current positions, which
// the previous step moved.
function preparePhysics2DConstraints(world: Physics2DWorld, indices: number[], start: number, count: number): void {
  const config = world.config;
  const end = start + count;
  for (let contactAt = start; contactAt < end; contactAt++) {
    const contact = world.contacts[indices[contactAt]];
    if (contact === undefined) continue;
    if (!contact.enabled || contact.sensor) continue;
    const bodyA = findPhysics2DBody(world, contact.bodyA);
    const bodyB = findPhysics2DBody(world, contact.bodyB);
    if (bodyA === null || bodyB === null) continue;

    const centerAX = bodyA.x + bodyA.centerX * Math.cos(bodyA.angle) - bodyA.centerY * Math.sin(bodyA.angle);
    const centerAY = bodyA.y + bodyA.centerX * Math.sin(bodyA.angle) + bodyA.centerY * Math.cos(bodyA.angle);
    const centerBX = bodyB.x + bodyB.centerX * Math.cos(bodyB.angle) - bodyB.centerY * Math.sin(bodyB.angle);
    const centerBY = bodyB.y + bodyB.centerX * Math.sin(bodyB.angle) + bodyB.centerY * Math.cos(bodyB.angle);

    const normalX = contact.normalX;
    const normalY = contact.normalY;
    const tangentX = -normalY;
    const tangentY = normalX;

    for (let i = 0; i < contact.pointCount; i++) {
      const point = contact.points[i];
      point.rAX = point.x - centerAX;
      point.rAY = point.y - centerAY;
      point.rBX = point.x - centerBX;
      point.rBY = point.y - centerBY;

      point.normalMass = effectiveMass(bodyA, bodyB, point.rAX, point.rAY, point.rBX, point.rBY, normalX, normalY);
      point.tangentMass = effectiveMass(bodyA, bodyB, point.rAX, point.rAY, point.rBX, point.rBY, tangentX, tangentY);

      // Restitution is dropped below a threshold approach speed. Without that, a ball bounces forever at
      // ever smaller amplitudes and never comes to rest.
      const approach = relativeNormalVelocity(bodyA, bodyB, point, normalX, normalY);
      point.bias = approach < -config.restitutionThreshold ? contact.restitution * approach : 0;
    }
  }
}

// One projected Gauss-Seidel pass over current contact geometry. Unlike the velocity solve, this moves
// poses directly and leaves velocity unchanged: penetration is a positional error, and injecting a
// separating velocity to repair it makes a resting body bounce away from a deep overlap. Each contact
// is regenerated immediately before it is solved because an earlier correction in the same pass may
// have moved either body. Reusing the current step's leased manifold keeps the pass allocation-free.
function solvePhysics2DPositionsOnce(world: Physics2DWorld, indices: number[], start: number, count: number): void {
  const config = world.config;
  const end = start + count;
  for (let contactAt = start; contactAt < end; contactAt++) {
    const contact = world.contacts[indices[contactAt]];
    if (contact === undefined) continue;
    if (!contact.enabled || contact.sensor) continue;
    const bodyA = findPhysics2DBody(world, contact.bodyA);
    const bodyB = findPhysics2DBody(world, contact.bodyB);
    if (bodyA === null || bodyB === null) continue;
    if (!isRigidBody2DPairAwake(bodyA, bodyB)) continue;

    const colliderA = bodyA.colliders[contact.colliderA];
    const colliderB = bodyB.colliders[contact.colliderB];
    if (colliderA === undefined || colliderB === undefined) continue;
    updatePhysics2DColliderWorldShape(colliderA, bodyA);
    updatePhysics2DColliderWorldShape(colliderB, bodyB);
    if (!collideContactManifold2D(colliderA.world, colliderB.world, getPhysics2DStepScratch().manifold)) continue;

    const normalX = getPhysics2DStepScratch().manifold.normalX;
    const normalY = getPhysics2DStepScratch().manifold.normalY;
    for (let i = 0; i < getPhysics2DStepScratch().manifold.pointCount; i++) {
      const point = getPhysics2DStepScratch().manifold.points[i];
      const excess = point.depth - config.penetrationSlop;
      if (excess <= 0) continue;

      const centerAX = bodyA.x + bodyA.centerX * Math.cos(bodyA.angle) - bodyA.centerY * Math.sin(bodyA.angle);
      const centerAY = bodyA.y + bodyA.centerX * Math.sin(bodyA.angle) + bodyA.centerY * Math.cos(bodyA.angle);
      const centerBX = bodyB.x + bodyB.centerX * Math.cos(bodyB.angle) - bodyB.centerY * Math.sin(bodyB.angle);
      const centerBY = bodyB.y + bodyB.centerX * Math.sin(bodyB.angle) + bodyB.centerY * Math.cos(bodyB.angle);
      const rAX = point.x - centerAX;
      const rAY = point.y - centerAY;
      const rBX = point.x - centerBX;
      const rBY = point.y - centerBY;
      const mass = effectiveMass(bodyA, bodyB, rAX, rAY, rBX, rBY, normalX, normalY);
      const impulse = config.positionCorrection * excess * mass;
      const impulseX = impulse * normalX;
      const impulseY = impulse * normalY;

      // Both terms are already centre-of-mass quantities — `rAX`/`rBX` were measured from the centres
      // computed just above — so they go through the same centre-preserving path the integrator uses
      // rather than being added to the origin and the angle independently.
      advancePhysics2DBodyTransform(
        bodyA,
        impulseX * bodyA.inverseMass,
        impulseY * bodyA.inverseMass,
        bodyA.inverseInertia * (rAX * impulseY - rAY * impulseX),
      );
      advancePhysics2DBodyTransform(
        bodyB,
        -impulseX * bodyB.inverseMass,
        -impulseY * bodyB.inverseMass,
        -bodyB.inverseInertia * (rBX * impulseY - rBY * impulseX),
      );
    }
  }
}

// The constraint's effective mass along `axis`: the inverse of how much the pair's velocity at the
// contact point changes per unit impulse. The angular terms are the lever arm crossed with the axis,
// which is the entire reason a contact point can produce torque — with only a minimum-translation vector
// and no point, both terms vanish and a box slides down a slope without ever tipping.
function effectiveMass(
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  rAX: number,
  rAY: number,
  rBX: number,
  rBY: number,
  axisX: number,
  axisY: number,
): number {
  const crossA = rAX * axisY - rAY * axisX;
  const crossB = rBX * axisY - rBY * axisX;
  const total =
    bodyA.inverseMass +
    bodyB.inverseMass +
    bodyA.inverseInertia * crossA * crossA +
    bodyB.inverseInertia * crossB * crossB;
  return total > 0 ? 1 / total : 0;
}

// Advances the simulation by `dt` seconds. Everything the step does, it does because the caller asked:
// there is no implicit accumulation, no fixed-timestep loop hidden inside, and no allocation once the
// world's bodies and contacts exist.
//
// The order of the phases is not arbitrary. World shapes must be current before the broadphase sees
// their bounds; the contact set must be built before impulses can warm-start from it; velocities are
// solved before positions are integrated, so the integration moves bodies that have already had their
// constraints applied rather than moving them and correcting afterwards.
// Installs the diagnostics seam consulted once per successful step, before joints are prepared. Pass
// `null` to remove it. Called by `enablePhysics2DGuards`; nothing in the solver path installs one, which
// is what keeps the message text out of a build that never opts in.
export function setPhysics2DJointResolutionGuard(guard: Physics2DJointResolutionGuard | null): void {
  physics2DJointResolutionGuard = guard;
}

// Installs the diagnostics seam consulted when a step declines its preconditions. Pass `null` to remove
// it. Called by `enablePhysics2DGuards`.
export function setPhysics2DStepGuard(guard: Physics2DStepGuard | null): void {
  physics2DStepGuard = guard;
}

export function stepPhysics2D(world: Physics2DWorld, dt: number): void {
  if (steppingPhysics2DWorlds.has(world)) {
    throw new Error('Cannot step a physics world recursively');
  }
  steppingPhysics2DWorlds.add(world);
  const previousScratch = activePhysics2DStepScratch;
  const scratch = acquirePhysics2DStepScratch();
  activePhysics2DStepScratch = scratch;
  try {
    stepPhysics2DOnce(world, dt);
  } finally {
    activePhysics2DStepScratch = previousScratch;
    releasePhysics2DStepScratch(scratch);
    steppingPhysics2DWorlds.delete(world);
  }
}

function stepPhysics2DOnce(world: Physics2DWorld, dt: number): void {
  const config = world.config;
  if (
    !isPhysics2DTimestepValid(dt) ||
    !Number.isSafeInteger(config.velocityIterations) ||
    config.velocityIterations < 0 ||
    !Number.isSafeInteger(config.positionIterations) ||
    config.positionIterations < 0 ||
    !isPhysics2DSolverConfigValid(config) ||
    !isPhysics2DGravityValid(world) ||
    !isPhysics2DPreviousTimestepValid(world) ||
    !isPhysics2DBodyStateValid(world) ||
    !isPhysics2DContactStateValid(world) ||
    !isPhysics2DJointStateValid(world)
  ) {
    physics2DStepGuard?.(world, dt);
    return;
  }

  // Only on a step that will actually run. A declined step already spoke above, and repeating the joint
  // complaint underneath it would bury the reason nothing moved at all.
  if (world.joints.length > 0) physics2DJointResolutionGuard?.(world);

  synchronizePhysics2DBroadphase(world);
  buildPhysics2DContacts(world);

  const preSolve = world.contactHooks.preSolve;
  if (preSolve !== null) {
    for (const contact of world.contacts) {
      if (contact.sensor) continue;
      const friction = contact.friction;
      const restitution = contact.restitution;
      const enabled = contact.enabled;
      const sensor = contact.sensor;
      try {
        preSolve(world, contact);
      } catch (error) {
        restorePhysics2DContactHookFields(contact, friction, restitution, enabled, sensor);
        throw error;
      }
      if (!isPhysics2DContactValid(contact)) {
        restorePhysics2DContactHookFields(contact, friction, restitution, enabled, sensor);
        throw new Error('Physics2D pre-solve hook produced invalid contact state');
      }
      // A disabled or sensor-converted contact solved nothing this step, so its old warm-start cache is
      // no longer evidence about the next one. Retaining it makes a temporarily disabled platform kick
      // a body with an impulse from before the gap when the contact is enabled again.
      if (!contact.enabled || contact.sensor) {
        for (let i = 0; i < contact.pointCount; i++) {
          contact.points[i].normalImpulse = 0;
          contact.points[i].tangentImpulse = 0;
        }
      }
    }
  }
  // Scale only after pre-solve succeeds. A callback may throw, and scaling before it would express the
  // cache in `dt` while `previousTimestep` still described the old interval; retrying would scale the
  // already-scaled cache a second time.
  scalePhysics2DWarmStartCaches(world, dt);

  const bodies = world.bodies;
  // Sleep is decided HERE — after the contact set is current, before anything integrates. The placement
  // is what makes every wake transition cost zero steps. A body woken by a force, by a new neighbour, or
  // by the caller writing a velocity is awake in time to be integrated by this same step; deciding after
  // integration instead would skip it once and move it a step late.
  updatePhysics2DSleep(world, dt);
  buildPhysics2DSolveIslands(world);

  for (let island = 0; island < world.solveIslandRoots.length; island++) {
    const start = world.solveIslandBodyStarts[island];
    const end = start + world.solveIslandBodyCounts[island];
    for (let at = start; at < end; at++) {
      const body = bodies[world.solveIslandBodyIndices[at]];
      if (body.type !== 'dynamic') continue;
      body.velocityX += (body.forceX * body.inverseMass + world.gravityX * body.gravityScale) * dt;
      body.velocityY += (body.forceY * body.inverseMass + world.gravityY * body.gravityScale) * dt;
      if (body.fixedRotation) body.angularVelocity = 0;
      else body.angularVelocity += body.torque * body.inverseInertia * dt;
      // Damping is applied as a multiplicative decay rather than a subtracted force so it stays stable at
      // any timestep: a force-shaped damping term large enough to matter can reverse the velocity it is
      // damping when dt is big.
      body.velocityX /= 1 + body.linearDamping * dt;
      body.velocityY /= 1 + body.linearDamping * dt;
      if (!body.fixedRotation) body.angularVelocity /= 1 + body.angularDamping * dt;
    }
  }

  for (let island = 0; island < world.solveIslandRoots.length; island++) {
    preparePhysics2DConstraints(
      world,
      world.solveIslandContactIndices,
      world.solveIslandContactStarts[island],
      world.solveIslandContactCounts[island],
    );
    const jointStart = world.solveIslandJointStarts[island];
    const jointEnd = jointStart + world.solveIslandJointCounts[island];
    for (let at = jointStart; at < jointEnd; at++) {
      const joint = world.joints[world.solveIslandJointIndices[at]];
      world.jointSolvers.get(joint.kind)?.prepare(world, joint, dt);
    }
  }
  // Joints warm-start alongside contacts, which is what the impulse block on Physics2DJoint has always
  // been documented to be for. Each kind reapplies its own converged impulse, because the block is
  // deliberately untyped and only the kind knows what its numbers mean. With warm starting off the
  // accumulators are cleared instead, so a world told not to use the cache does not quietly keep
  // seeding from it — the previous code left them growing whether the flag was set or not.
  if (config.warmStarting) {
    for (let island = 0; island < world.solveIslandRoots.length; island++) {
      warmStartPhysics2DContactIndices(
        world,
        world.solveIslandContactIndices,
        world.solveIslandContactStarts[island],
        world.solveIslandContactCounts[island],
      );
    }
  } else {
    // A cold start means the accumulated contact impulses are not part of THIS step's solve at all.
    // Merely skipping their reapplication is not enough: solvePhysics2DContact clamps each incremental
    // impulse against the stored total, so a cache left in the point still changes the projection even
    // when it was never applied to the bodies. Clear before the first iteration, including when the
    // iteration count is zero, so toggling warm starting off has an exact and inspectable meaning.
    for (const contact of world.contacts) {
      for (let i = 0; i < contact.pointCount; i++) {
        contact.points[i].normalImpulse = 0;
        contact.points[i].tangentImpulse = 0;
      }
    }
  }
  // Warm starting is decided per KIND as well as per world, because it is a capability and not just a
  // preference. A kind that declares no warmStart is never reapplying its accumulator — the mouse joint
  // omits it deliberately, since a target that moves between steps invalidates the previous impulse —
  // so that accumulator has to be cleared even when the world is warm starting. Keying only on the
  // world flag left the mouse's stale impulse live: after zeroing a body's velocity and moving the
  // target onto it, the next step still produced motion, contradicting the cold-start contract on the
  // type. An impulse that is never reapplied must be cleared, or it is neither warm nor cold.
  for (let island = 0; island < world.solveIslandRoots.length; island++) {
    const start = world.solveIslandJointStarts[island];
    const end = start + world.solveIslandJointCounts[island];
    for (let at = start; at < end; at++) {
      const joint = world.joints[world.solveIslandJointIndices[at]];
      const solver = world.jointSolvers.get(joint.kind);
      if (solver === undefined) continue;
      if (config.warmStarting && solver.warmStart !== undefined) {
        solver.warmStart(world, joint);
      } else {
        solver.clearAccumulatedImpulses?.(joint);
      }
    }
  }
  // Joints and contacts share one solve list and one iteration count. Solving them in separate passes
  // would let each undo the other's correction — a hinge under load creeps if the contacts beneath it get
  // a whole pass to themselves between joint iterations.
  for (let island = 0; island < world.solveIslandRoots.length; island++) {
    const jointStart = world.solveIslandJointStarts[island];
    const jointEnd = jointStart + world.solveIslandJointCounts[island];
    const contactStart = world.solveIslandContactStarts[island];
    const contactCount = world.solveIslandContactCounts[island];
    for (let iteration = 0; iteration < config.velocityIterations; iteration++) {
      for (let at = jointStart; at < jointEnd; at++) {
        const joint = world.joints[world.solveIslandJointIndices[at]];
        world.jointSolvers.get(joint.kind)?.solve(world, joint);
      }
      solvePhysics2DContactIndicesOnce(world, world.solveIslandContactIndices, contactStart, contactCount);
    }
  }

  // The sleeping skip here is a COST saving, not a behavioural one, and the distinction is worth having
  // in writing: a sleeping body's velocity is zeroed when it falls asleep and nothing can hand it more
  // (any awake neighbour puts it in an awake island before this point), so integrating it would move it
  // by exactly zero. What the skip buys is that a settled thousand-body pile costs no integration work
  // at all, which is the entire reason sleep exists. Removing it changes no observable result.
  if (config.continuousCollision && config.maxCcdSubsteps > 0 && hasActivePhysics2DBullet(world)) {
    integratePhysics2DContinuous(world, dt);
  } else {
    advancePhysics2DSolveIslandBodies(world, dt);
  }

  for (let island = 0; island < world.solveIslandRoots.length; island++) {
    const contactStart = world.solveIslandContactStarts[island];
    const contactCount = world.solveIslandContactCounts[island];
    for (let iteration = 0; iteration < config.positionIterations; iteration++) {
      solvePhysics2DPositionsOnce(world, world.solveIslandContactIndices, contactStart, contactCount);
    }
  }

  for (const body of bodies) {
    body.forceX = 0;
    body.forceY = 0;
    body.torque = 0;
  }
  world.previousTimestep = dt;

  // Post-solve observes a committed step. User code can throw without preventing transform integration,
  // force cleanup, or the timestep/cache agreement above, so the next call never resumes a half-step.
  const postSolve = world.contactHooks.postSolve;
  if (postSolve !== null) {
    for (const contact of world.contacts) {
      if (!contact.enabled || contact.sensor) continue;
      const bodyA = findPhysics2DBody(world, contact.bodyA);
      const bodyB = findPhysics2DBody(world, contact.bodyB);
      if (bodyA === null || bodyB === null || !isRigidBody2DPairAwake(bodyA, bodyB)) continue;
      const friction = contact.friction;
      const restitution = contact.restitution;
      const enabled = contact.enabled;
      const sensor = contact.sensor;
      try {
        postSolve(world, contact);
      } catch (error) {
        restorePhysics2DContactHookFields(contact, friction, restitution, enabled, sensor);
        throw error;
      }
      if (!isPhysics2DContactValid(contact)) {
        restorePhysics2DContactHookFields(contact, friction, restitution, enabled, sensor);
        throw new Error('Physics2D post-solve hook produced invalid contact state');
      }
    }
  }
}

function advancePhysics2DSolveIslandBodies(world: Physics2DWorld, dt: number): void {
  for (let island = 0; island < world.solveIslandRoots.length; island++) {
    const start = world.solveIslandBodyStarts[island];
    const end = start + world.solveIslandBodyCounts[island];
    for (let at = start; at < end; at++) advancePhysics2DBody(world.bodies[world.solveIslandBodyIndices[at]], dt);
  }
}

function advancePhysics2DBody(body: RigidBody2D, dt: number): void {
  advancePhysics2DBodyTransform(
    body,
    body.velocityX * dt,
    body.velocityY * dt,
    body.fixedRotation ? 0 : body.angularVelocity * dt,
  );
}

// Moves a body by a displacement OF ITS CENTRE OF MASS plus a rotation ABOUT that centre, which is the
// only frame the solver ever works in: `velocityX`/`velocityY` are the centre's velocity, and every
// lever arm (`rAX`, `rBY`, ...) is measured from the centre outward.
//
// `body.x`/`body.y` are the body ORIGIN, not the centre, so the two coincide only when the colliders
// happen to be symmetric about the origin. Adding the displacement straight to the origin and the
// rotation straight to the angle is therefore wrong the moment `centerX`/`centerY` is non-zero: the
// centre swings on the arm from the origin, so a body spinning in free space with zero linear velocity
// TRANSLATES its own centre of mass — no force, no contact, momentum invented from nothing. The origin
// has to be re-derived from where the centre ended up and which way the body is now facing.
function advancePhysics2DBodyTransform(
  body: RigidBody2D,
  centerDeltaX: number,
  centerDeltaY: number,
  angleDelta: number,
): void {
  // A centred body needs none of this, and it is the overwhelmingly common case — every collider built
  // symmetrically about its body origin lands here — so it keeps the four-trig path off the hot loop.
  if (body.centerX === 0 && body.centerY === 0) {
    body.x += centerDeltaX;
    body.y += centerDeltaY;
    body.angle += angleDelta;
    return;
  }
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  const centerX = body.x + body.centerX * cos - body.centerY * sin + centerDeltaX;
  const centerY = body.y + body.centerX * sin + body.centerY * cos + centerDeltaY;
  const angle = body.angle + angleDelta;
  const nextCos = Math.cos(angle);
  const nextSin = Math.sin(angle);
  body.x = centerX - (body.centerX * nextCos - body.centerY * nextSin);
  body.y = centerY - (body.centerX * nextSin + body.centerY * nextCos);
  body.angle = angle;
}

function hasActivePhysics2DBullet(world: Readonly<Physics2DWorld>): boolean {
  for (const body of world.bodies) {
    if (body.type === 'dynamic' && body.bullet && !body.sleeping) return true;
  }
  return false;
}

// Chronological CCD. Every event first becomes a persistent contact and traverses pre-solve, then
// advances the whole awake world to the same time, applies one impact impulse, refreshes collider
// transforms, and searches the remaining interval again. Translation uses collision's analytic linear
// sweep; angular motion uses bounded sampling plus bisection under maxCcdRotationSubsteps. The two hard
// bounds keep pinball corridors and multi-revolution bodies deterministic in cost.
function integratePhysics2DContinuous(world: Physics2DWorld, dt: number): void {
  let remaining = dt;
  for (let substep = 0; substep < world.config.maxCcdSubsteps && remaining > 0; substep++) {
    if (!findEarliestPhysics2DImpact(world, remaining)) break;
    const advance = remaining * getPhysics2DStepScratch().ccdImpactFraction;
    advanceAllAwakePhysics2DBodies(world, advance);
    remaining -= advance;
    synchronizePhysics2DBroadphase(world);
    resolveEarliestPhysics2DImpact(world);
    if (getPhysics2DStepScratch().ccdImpactFraction >= 1) return;
  }
  if (remaining > 0) advanceAllAwakePhysics2DBodies(world, remaining);
}

function advanceAllAwakePhysics2DBodies(world: Physics2DWorld, dt: number): void {
  for (const body of world.bodies) {
    if (body.type === 'static' || body.sleeping) continue;
    advancePhysics2DBody(body, dt);
  }
}

function findEarliestPhysics2DImpact(world: Physics2DWorld, dt: number): boolean {
  getPhysics2DStepScratch().ccdImpactFraction = Number.POSITIVE_INFINITY;
  getPhysics2DStepScratch().ccdImpactBodyA = -1;
  getPhysics2DStepScratch().ccdImpactBodyB = -1;
  getPhysics2DStepScratch().ccdImpactColliderA = -1;
  getPhysics2DStepScratch().ccdImpactColliderB = -1;
  synchronizePhysics2DSweptBroadphase(world, dt);
  world.index.querySpatialPairs(getPhysics2DStepScratch().ccdPairs);
  synchronizePhysics2DBroadphase(world);
  for (const pair of getPhysics2DStepScratch().ccdPairs) {
    const firstBody = findPhysics2DBody(world, pair.a);
    const secondBody = findPhysics2DBody(world, pair.b);
    if (firstBody === null || secondBody === null) continue;
    const ordered = isPhysics2DPairOrdered(firstBody, secondBody);
    const bodyA = ordered ? firstBody : secondBody;
    const bodyB = ordered ? secondBody : firstBody;
    if (!isPhysics2DCcdPairActive(bodyA, bodyB)) continue;
    if (isPhysics2DPairJointSuppressed(world, bodyA.index, bodyB.index)) continue;
    const translationAX = bodyA.type === 'static' || bodyA.sleeping ? 0 : bodyA.velocityX * dt;
    const translationAY = bodyA.type === 'static' || bodyA.sleeping ? 0 : bodyA.velocityY * dt;
    const translationBX = bodyB.type === 'static' || bodyB.sleeping ? 0 : bodyB.velocityX * dt;
    const translationBY = bodyB.type === 'static' || bodyB.sleeping ? 0 : bodyB.velocityY * dt;
    for (let colliderA = 0; colliderA < bodyA.colliders.length; colliderA++) {
      const first = bodyA.colliders[colliderA];
      if (first.sensor) continue;
      for (let colliderB = 0; colliderB < bodyB.colliders.length; colliderB++) {
        const second = bodyB.colliders[colliderB];
        if (second.sensor || !isPhysics2DColliderPairEnabled(first, second)) continue;
        // An ordinary contact was already prepared and solved before CCD integration. Sweeping it
        // again at fraction zero would double-apply its impulse and can consume the entire CCD budget
        // without advancing time.
        if (findPhysics2DContact(world, bodyA.index, bodyB.index, colliderA, colliderB) !== null) continue;
        if (
          !findPhysics2DColliderImpact(
            world,
            bodyA,
            bodyB,
            first,
            second,
            translationAX,
            translationAY,
            translationBX,
            translationBY,
            dt,
          ) ||
          getPhysics2DStepScratch().ccdSweep.fraction > getPhysics2DStepScratch().ccdImpactFraction ||
          !isPhysics2DImpactApproaching(
            bodyA,
            bodyB,
            getPhysics2DStepScratch().ccdSweep,
            translationAX,
            translationAY,
            translationBX,
            translationBY,
            bodyA.angularVelocity * dt,
            bodyB.angularVelocity * dt,
          )
        ) {
          continue;
        }
        getPhysics2DStepScratch().ccdImpactFraction = getPhysics2DStepScratch().ccdSweep.fraction;
        getPhysics2DStepScratch().ccdImpactBodyA = bodyA.index;
        getPhysics2DStepScratch().ccdImpactBodyB = bodyB.index;
        getPhysics2DStepScratch().ccdImpactColliderA = colliderA;
        getPhysics2DStepScratch().ccdImpactColliderB = colliderB;
        getPhysics2DStepScratch().ccdImpactX = getPhysics2DStepScratch().ccdSweep.x;
        getPhysics2DStepScratch().ccdImpactY = getPhysics2DStepScratch().ccdSweep.y;
        getPhysics2DStepScratch().ccdImpactNormalX = getPhysics2DStepScratch().ccdSweep.normalX;
        getPhysics2DStepScratch().ccdImpactNormalY = getPhysics2DStepScratch().ccdSweep.normalY;
      }
    }
  }
  return getPhysics2DStepScratch().ccdImpactBodyA >= 0;
}

function findPhysics2DColliderImpact(
  world: Readonly<Physics2DWorld>,
  bodyA: RigidBody2D,
  bodyB: RigidBody2D,
  colliderA: RigidBody2D['colliders'][number],
  colliderB: RigidBody2D['colliders'][number],
  translationAX: number,
  translationAY: number,
  translationBX: number,
  translationBY: number,
  dt: number,
): boolean {
  const rotationA = bodyA.type === 'static' || bodyA.sleeping ? 0 : bodyA.angularVelocity * dt;
  const rotationB = bodyB.type === 'static' || bodyB.sleeping ? 0 : bodyB.angularVelocity * dt;
  if ((rotationA !== 0 || rotationB !== 0) && world.config.maxCcdRotationSubsteps > 0) {
    return findPhysics2DRotationalImpact(
      bodyA,
      bodyB,
      colliderA,
      colliderB,
      translationAX,
      translationAY,
      translationBX,
      translationBY,
      rotationA,
      rotationB,
      world.config.maxCcdRotationSubsteps,
    );
  }
  return sweepCollisionShape2D(
    colliderA.world,
    translationAX,
    translationAY,
    colliderB.world,
    translationBX,
    translationBY,
    getPhysics2DStepScratch().ccdSweep,
  );
}

function findPhysics2DRotationalImpact(
  bodyA: RigidBody2D,
  bodyB: RigidBody2D,
  colliderA: RigidBody2D['colliders'][number],
  colliderB: RigidBody2D['colliders'][number],
  translationAX: number,
  translationAY: number,
  translationBX: number,
  translationBY: number,
  rotationA: number,
  rotationB: number,
  maxSubsteps: number,
): boolean {
  const angularTravel = Math.max(Math.abs(rotationA), Math.abs(rotationB));
  const substeps = Math.min(maxSubsteps, Math.max(1, Math.ceil(angularTravel / CCD_ROTATION_INCREMENT)));
  let lowerFraction = 0;
  for (let sample = 1; sample <= substeps; sample++) {
    const upperFraction = sample / substeps;
    if (
      !testPhysics2DColliderOverlapAtFraction(
        bodyA,
        bodyB,
        colliderA,
        colliderB,
        translationAX,
        translationAY,
        translationBX,
        translationBY,
        rotationA,
        rotationB,
        upperFraction,
      )
    ) {
      lowerFraction = upperFraction;
      continue;
    }

    let upper = upperFraction;
    let lower = lowerFraction;
    for (let iteration = 0; iteration < CCD_ROTATION_BISECTION_ITERATIONS; iteration++) {
      const middle = (lower + upper) * 0.5;
      if (
        testPhysics2DColliderOverlapAtFraction(
          bodyA,
          bodyB,
          colliderA,
          colliderB,
          translationAX,
          translationAY,
          translationBX,
          translationBY,
          rotationA,
          rotationB,
          middle,
        )
      ) {
        upper = middle;
      } else {
        lower = middle;
      }
    }
    testPhysics2DColliderOverlapAtFraction(
      bodyA,
      bodyB,
      colliderA,
      colliderB,
      translationAX,
      translationAY,
      translationBX,
      translationBY,
      rotationA,
      rotationB,
      upper,
    );
    const point = getPhysics2DStepScratch().ccdRotationalManifold.points[0];
    getPhysics2DStepScratch().ccdSweep.fraction = upper;
    getPhysics2DStepScratch().ccdSweep.x = point.x;
    getPhysics2DStepScratch().ccdSweep.y = point.y;
    getPhysics2DStepScratch().ccdSweep.normalX = getPhysics2DStepScratch().ccdRotationalManifold.normalX;
    getPhysics2DStepScratch().ccdSweep.normalY = getPhysics2DStepScratch().ccdRotationalManifold.normalY;
    return true;
  }
  return false;
}

function testPhysics2DColliderOverlapAtFraction(
  bodyA: RigidBody2D,
  bodyB: RigidBody2D,
  colliderA: RigidBody2D['colliders'][number],
  colliderB: RigidBody2D['colliders'][number],
  translationAX: number,
  translationAY: number,
  translationBX: number,
  translationBY: number,
  rotationA: number,
  rotationB: number,
  fraction: number,
): boolean {
  const xA = bodyA.x;
  const yA = bodyA.y;
  const angleA = bodyA.angle;
  const xB = bodyB.x;
  const yB = bodyB.y;
  const angleB = bodyB.angle;
  bodyA.x = xA + translationAX * fraction;
  bodyA.y = yA + translationAY * fraction;
  bodyA.angle = angleA + rotationA * fraction;
  bodyB.x = xB + translationBX * fraction;
  bodyB.y = yB + translationBY * fraction;
  bodyB.angle = angleB + rotationB * fraction;
  try {
    updatePhysics2DColliderWorldShape(colliderA, bodyA);
    updatePhysics2DColliderWorldShape(colliderB, bodyB);
    return collideContactManifold2D(colliderA.world, colliderB.world, getPhysics2DStepScratch().ccdRotationalManifold);
  } finally {
    bodyA.x = xA;
    bodyA.y = yA;
    bodyA.angle = angleA;
    bodyB.x = xB;
    bodyB.y = yB;
    bodyB.angle = angleB;
    updatePhysics2DColliderWorldShape(colliderA, bodyA);
    updatePhysics2DColliderWorldShape(colliderB, bodyB);
  }
}

function isPhysics2DCcdPairActive(bodyA: Readonly<RigidBody2D>, bodyB: Readonly<RigidBody2D>): boolean {
  const bulletA = bodyA.type === 'dynamic' && bodyA.bullet && !bodyA.sleeping;
  const bulletB = bodyB.type === 'dynamic' && bodyB.bullet && !bodyB.sleeping;
  if (!bulletA && !bulletB) return false;
  return bodyA.inverseMass > 0 || bodyB.inverseMass > 0;
}

function isPhysics2DImpactApproaching(
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  impact: Readonly<CollisionTimeOfImpact2D>,
  translationAX: number,
  translationAY: number,
  translationBX: number,
  translationBY: number,
  rotationA: number,
  rotationB: number,
): boolean {
  writePhysics2DBodyCenter(
    bodyA,
    translationAX * impact.fraction,
    translationAY * impact.fraction,
    rotationA * impact.fraction,
    getPhysics2DStepScratch().ccdCenterA,
  );
  writePhysics2DBodyCenter(
    bodyB,
    translationBX * impact.fraction,
    translationBY * impact.fraction,
    rotationB * impact.fraction,
    getPhysics2DStepScratch().ccdCenterB,
  );
  const rAX = impact.x - getPhysics2DStepScratch().ccdCenterA.x;
  const rAY = impact.y - getPhysics2DStepScratch().ccdCenterA.y;
  const rBX = impact.x - getPhysics2DStepScratch().ccdCenterB.x;
  const rBY = impact.y - getPhysics2DStepScratch().ccdCenterB.y;
  return relativePhysics2DPointVelocity(bodyA, bodyB, rAX, rAY, rBX, rBY, impact.normalX, impact.normalY) < -1e-9;
}

function resolveEarliestPhysics2DImpact(world: Physics2DWorld): void {
  const bodyA = findPhysics2DBody(world, getPhysics2DStepScratch().ccdImpactBodyA);
  const bodyB = findPhysics2DBody(world, getPhysics2DStepScratch().ccdImpactBodyB);
  if (bodyA === null || bodyB === null) return;
  const colliderA = bodyA.colliders[getPhysics2DStepScratch().ccdImpactColliderA];
  const colliderB = bodyB.colliders[getPhysics2DStepScratch().ccdImpactColliderB];
  if (colliderA === undefined || colliderB === undefined) return;
  const contact = createPhysics2DImpactContact(world, bodyA, bodyB, colliderA, colliderB);
  if (!contact.enabled || contact.sensor) return;
  if (bodyA.type !== 'static') {
    bodyA.sleeping = false;
    bodyA.sleepTimer = 0;
  }
  if (bodyB.type !== 'static') {
    bodyB.sleeping = false;
    bodyB.sleepTimer = 0;
  }
  writePhysics2DBodyCenter(bodyA, 0, 0, 0, getPhysics2DStepScratch().ccdCenterA);
  writePhysics2DBodyCenter(bodyB, 0, 0, 0, getPhysics2DStepScratch().ccdCenterB);
  const rAX = getPhysics2DStepScratch().ccdImpactX - getPhysics2DStepScratch().ccdCenterA.x;
  const rAY = getPhysics2DStepScratch().ccdImpactY - getPhysics2DStepScratch().ccdCenterA.y;
  const rBX = getPhysics2DStepScratch().ccdImpactX - getPhysics2DStepScratch().ccdCenterB.x;
  const rBY = getPhysics2DStepScratch().ccdImpactY - getPhysics2DStepScratch().ccdCenterB.y;
  const normalMass = effectiveMass(
    bodyA,
    bodyB,
    rAX,
    rAY,
    rBX,
    rBY,
    getPhysics2DStepScratch().ccdImpactNormalX,
    getPhysics2DStepScratch().ccdImpactNormalY,
  );
  if (!(normalMass > 0)) return;
  const approach = relativePhysics2DPointVelocity(
    bodyA,
    bodyB,
    rAX,
    rAY,
    rBX,
    rBY,
    getPhysics2DStepScratch().ccdImpactNormalX,
    getPhysics2DStepScratch().ccdImpactNormalY,
  );
  if (approach >= 0) return;
  const restitution = approach < -world.config.restitutionThreshold ? contact.restitution : 0;
  const normalImpulse = -(1 + restitution) * approach * normalMass;
  applyPhysics2DImpulse(
    bodyA,
    bodyB,
    rAX,
    rAY,
    rBX,
    rBY,
    normalImpulse * getPhysics2DStepScratch().ccdImpactNormalX,
    normalImpulse * getPhysics2DStepScratch().ccdImpactNormalY,
  );
  contact.points[0].normalImpulse = normalImpulse;

  const tangentX = -getPhysics2DStepScratch().ccdImpactNormalY;
  const tangentY = getPhysics2DStepScratch().ccdImpactNormalX;
  const tangentMass = effectiveMass(bodyA, bodyB, rAX, rAY, rBX, rBY, tangentX, tangentY);
  if (!(tangentMass > 0)) return;
  const tangentVelocity = relativePhysics2DPointVelocity(bodyA, bodyB, rAX, rAY, rBX, rBY, tangentX, tangentY);
  const friction = contact.friction;
  const tangentImpulse = Math.max(
    -friction * normalImpulse,
    Math.min(friction * normalImpulse, -tangentVelocity * tangentMass),
  );
  applyPhysics2DImpulse(bodyA, bodyB, rAX, rAY, rBX, rBY, tangentImpulse * tangentX, tangentImpulse * tangentY);
  contact.points[0].tangentImpulse = tangentImpulse;
}

function createPhysics2DImpactContact(
  world: Physics2DWorld,
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  colliderA: Readonly<RigidBody2D['colliders'][number]>,
  colliderB: Readonly<RigidBody2D['colliders'][number]>,
): Physics2DContact {
  getPhysics2DStepScratch().manifold.normalX = getPhysics2DStepScratch().ccdImpactNormalX;
  getPhysics2DStepScratch().manifold.normalY = getPhysics2DStepScratch().ccdImpactNormalY;
  getPhysics2DStepScratch().manifold.pointCount = 1;
  getPhysics2DStepScratch().manifold.points[0].x = getPhysics2DStepScratch().ccdImpactX;
  getPhysics2DStepScratch().manifold.points[0].y = getPhysics2DStepScratch().ccdImpactY;
  getPhysics2DStepScratch().manifold.points[0].depth = 0;
  getPhysics2DStepScratch().manifold.points[0].featureId = 0;
  const contact = mergePhysics2DContact(
    world,
    bodyA.index,
    bodyB.index,
    getPhysics2DStepScratch().ccdImpactColliderA,
    getPhysics2DStepScratch().ccdImpactColliderB,
    getPhysics2DStepScratch().manifold,
    false,
    mixPhysics2DFriction(colliderA.material.friction, colliderB.material.friction),
    mixPhysics2DRestitution(colliderA.material.restitution, colliderB.material.restitution),
  );
  const preSolve = world.contactHooks.preSolve;
  if (preSolve === null) return contact;
  const friction = contact.friction;
  const restitution = contact.restitution;
  const enabled = contact.enabled;
  const sensor = contact.sensor;
  try {
    preSolve(world, contact);
  } catch (error) {
    restorePhysics2DContactHookFields(contact, friction, restitution, enabled, sensor);
    throw error;
  }
  if (!isPhysics2DContactValid(contact)) {
    restorePhysics2DContactHookFields(contact, friction, restitution, enabled, sensor);
    throw new Error('Physics2D pre-solve hook produced invalid contact state');
  }
  return contact;
}

function findPhysics2DContact(
  world: Readonly<Physics2DWorld>,
  bodyA: number,
  bodyB: number,
  colliderA: number,
  colliderB: number,
): Physics2DContact | null {
  for (const contact of world.contacts) {
    if (
      contact.bodyA === bodyA &&
      contact.bodyB === bodyB &&
      contact.colliderA === colliderA &&
      contact.colliderB === colliderB
    ) {
      return contact;
    }
  }
  return null;
}

function relativePhysics2DPointVelocity(
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  rAX: number,
  rAY: number,
  rBX: number,
  rBY: number,
  axisX: number,
  axisY: number,
): number {
  const velocityAX = bodyA.velocityX - bodyA.angularVelocity * rAY;
  const velocityAY = bodyA.velocityY + bodyA.angularVelocity * rAX;
  const velocityBX = bodyB.velocityX - bodyB.angularVelocity * rBY;
  const velocityBY = bodyB.velocityY + bodyB.angularVelocity * rBX;
  return (velocityAX - velocityBX) * axisX + (velocityAY - velocityBY) * axisY;
}

function writePhysics2DBodyCenter(
  body: Readonly<RigidBody2D>,
  translationX: number,
  translationY: number,
  rotation: number,
  out: { x: number; y: number },
): void {
  const cos = Math.cos(body.angle + rotation);
  const sin = Math.sin(body.angle + rotation);
  out.x = body.x + translationX + body.centerX * cos - body.centerY * sin;
  out.y = body.y + translationY + body.centerX * sin + body.centerY * cos;
}

function restorePhysics2DContactHookFields(
  contact: Physics2DContact,
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

// Accumulated impulses have force*time units. Reusing one unchanged across a different time interval
// applies the wrong force before the first iteration gets a chance to correct it, which is most visible
// as a stack or motor kicking when a frame changes cadence. A non-finite ratio clears the cache rather
// than allowing an extreme pair of otherwise-valid positive timesteps to seed infinity.
function scalePhysics2DWarmStartCaches(world: Physics2DWorld, dt: number): void {
  const previous = world.previousTimestep;
  if (!(previous > 0) || previous === dt) return;
  const divided = dt / previous;
  const timestepRatio = Number.isFinite(divided) ? divided : 0;
  for (const contact of world.contacts) {
    for (let i = 0; i < contact.pointCount; i++) {
      contact.points[i].normalImpulse *= timestepRatio;
      contact.points[i].tangentImpulse *= timestepRatio;
    }
  }
  for (const joint of world.joints) {
    joint.impulse0 *= timestepRatio;
    joint.impulse1 *= timestepRatio;
    joint.impulse2 *= timestepRatio;
    world.jointSolvers.get(joint.kind)?.scaleAccumulatedImpulses?.(joint, timestepRatio);
  }
}

function createPhysics2DContactPoint(): Physics2DContactPoint {
  return {
    x: 0,
    y: 0,
    depth: 0,
    featureId: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
    normalImpulse: 0,
    tangentImpulse: 0,
    normalMass: 0,
    tangentMass: 0,
    bias: 0,
  };
}

// Whether any of the body's colliders senses rather than collides. Cheap enough to ask per pair: a
// body carries a handful of colliders, and the alternative is inspecting every collider pairing.
function hasSensorCollider(body: Readonly<RigidBody2D>): boolean {
  for (const collider of body.colliders) {
    if (collider.sensor) return true;
  }
  return false;
}

// Total order over contacts, by the four identities that define one. Every field is a persistent index,
// so the order is stable across steps and independent of the broadphase's history.
function comparePhysics2DContacts(left: Readonly<Physics2DContact>, right: Readonly<Physics2DContact>): number {
  if (left.bodyA !== right.bodyA) return left.bodyA - right.bodyA;
  if (left.bodyB !== right.bodyB) return left.bodyB - right.bodyB;
  if (left.colliderA !== right.colliderA) return left.colliderA - right.colliderA;
  return left.colliderB - right.colliderB;
}

interface Physics2DStepScratch {
  pairs: SpatialPair[];
  ccdPairs: SpatialPair[];
  manifold: CollisionContactManifold2D;
  ccdSweep: CollisionTimeOfImpact2D;
  ccdRotationalManifold: CollisionContactManifold2D;
  ccdCenterA: { x: number; y: number };
  ccdCenterB: { x: number; y: number };
  ccdImpactFraction: number;
  ccdImpactBodyA: number;
  ccdImpactBodyB: number;
  ccdImpactColliderA: number;
  ccdImpactColliderB: number;
  ccdImpactX: number;
  ccdImpactY: number;
  ccdImpactNormalX: number;
  ccdImpactNormalY: number;
}

function acquirePhysics2DStepScratch(): Physics2DStepScratch {
  return physics2DStepScratchPool.pop() ?? createPhysics2DStepScratch();
}

function createPhysics2DStepScratch(): Physics2DStepScratch {
  return {
    pairs: [],
    ccdPairs: [],
    manifold: createCollisionContactManifold2D(),
    ccdSweep: createCollisionTimeOfImpact2D(),
    ccdRotationalManifold: createCollisionContactManifold2D(),
    ccdCenterA: { x: 0, y: 0 },
    ccdCenterB: { x: 0, y: 0 },
    ccdImpactFraction: 0,
    ccdImpactBodyA: -1,
    ccdImpactBodyB: -1,
    ccdImpactColliderA: -1,
    ccdImpactColliderB: -1,
    ccdImpactX: 0,
    ccdImpactY: 0,
    ccdImpactNormalX: 0,
    ccdImpactNormalY: 0,
  };
}

function getPhysics2DStepScratch(): Physics2DStepScratch {
  return activePhysics2DStepScratch!;
}

function releasePhysics2DStepScratch(scratch: Physics2DStepScratch): void {
  scratch.pairs.length = 0;
  scratch.ccdPairs.length = 0;
  physics2DStepScratchPool.push(scratch);
}

let activePhysics2DStepScratch: Physics2DStepScratch | null = null;
let physics2DJointResolutionGuard: Physics2DJointResolutionGuard | null = null;
let physics2DStepGuard: Physics2DStepGuard | null = null;
const physics2DStepScratchPool: Physics2DStepScratch[] = [createPhysics2DStepScratch()];
const defaultCollisionFilter = { categoryBits: 1, maskBits: 0xffffffff, groupIndex: 0 };
const CCD_ROTATION_INCREMENT = Math.PI / 90;
const CCD_ROTATION_BISECTION_ITERATIONS = 12;
