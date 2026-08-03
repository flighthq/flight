import {
  collideContactManifold,
  createCollisionContactManifold,
  getCollisionShapeContainsPoint,
  testSegmentAabbCollision,
  testSegmentCircleCollision,
  testSegmentObbCollision,
  testSegmentPolygonCollision,
  testSegmentSegmentCollision,
} from '@flighthq/collision/contract';
import type {
  CollisionContactManifold,
  CollisionSegment,
  CollisionShape,
  Physics2DContact,
  Physics2DContactPoint,
  Physics2DWorld,
  RigidBody2D,
  SpatialPair,
} from '@flighthq/types/contract';

import { synchronizePhysics2DBroadphase } from './broadphase';
import { updatePhysics2DColliderWorldShape } from './colliderTransform';
import { buildPhysics2DSolveIslands, isRigidBody2DPairAwake, updatePhysics2DSleep } from './islands';
import { mixPhysics2DFriction, mixPhysics2DRestitution } from './material';
import { steppingPhysics2DWorlds } from './ownership';
import { relativeNormalVelocity, solvePhysics2DContactIndicesOnce, warmStartPhysics2DContactIndices } from './solver';
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
//      `querySpatialPairs` walks a Map of Sets, so its order follows insertion and movement history.
//
// Neither substitutes for the other: the first fixes contact identity, the second fixes solve order.
// A determinism harness that shuffles only insertion order would pass with the first one broken.
function buildPhysics2DContacts(world: Physics2DWorld): void {
  world.index.querySpatialPairs(pairScratch);

  world.events.began.length = 0;
  world.events.ended.length = 0;
  for (const contact of world.contacts) contact.touching = false;

  for (const pair of pairScratch) {
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
        const manifold = collideContactManifold(colliderA.world, colliderB.world, manifoldScratch);
        if (!manifold && (!sensorPair || !testPhysics2DAreaLessSensorOverlap(colliderA.world, colliderB.world))) {
          continue;
        }
        mergePhysics2DContact(
          world,
          bodyA.index,
          bodyB.index,
          i,
          j,
          manifoldScratch,
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
function testPhysics2DAreaLessSensorOverlap(a: Readonly<CollisionShape>, b: Readonly<CollisionShape>): boolean {
  if (a.kind === 'point') return getCollisionShapeContainsPoint(b, a.x, a.y);
  if (b.kind === 'point') return getCollisionShapeContainsPoint(a, b.x, b.y);
  if (a.kind === 'segment') return testPhysics2DSegmentOverlap(a, b);
  if (b.kind === 'segment') return testPhysics2DSegmentOverlap(b, a);
  return false;
}

function testPhysics2DSegmentOverlap(
  segment: Readonly<CollisionSegment & { kind: 'segment' }>,
  other: Readonly<CollisionShape>,
): boolean {
  switch (other.kind) {
    case 'aabb':
      return testSegmentAabbCollision(segment, other);
    case 'circle':
      return testSegmentCircleCollision(segment, other);
    case 'obb':
      return testSegmentObbCollision(segment, other);
    case 'polygon':
      return testSegmentPolygonCollision(segment, other);
    case 'segment':
      return testSegmentSegmentCollision(segment, other);
    case 'point':
      return getCollisionShapeContainsPoint(segment, other.x, other.y);
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
  manifold: Readonly<CollisionContactManifold>,
  sensor: boolean,
  friction: number,
  restitution: number,
): void {
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
// have moved either body. Reusing the module manifold scratch keeps the pass allocation-free.
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
    if (!collideContactManifold(colliderA.world, colliderB.world, manifoldScratch)) continue;

    const normalX = manifoldScratch.normalX;
    const normalY = manifoldScratch.normalY;
    for (let i = 0; i < manifoldScratch.pointCount; i++) {
      const point = manifoldScratch.points[i];
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

      bodyA.x += impulseX * bodyA.inverseMass;
      bodyA.y += impulseY * bodyA.inverseMass;
      bodyA.angle += bodyA.inverseInertia * (rAX * impulseY - rAY * impulseX);
      bodyB.x -= impulseX * bodyB.inverseMass;
      bodyB.y -= impulseY * bodyB.inverseMass;
      bodyB.angle -= bodyB.inverseInertia * (rBX * impulseY - rBY * impulseX);
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
export function stepPhysics2D(world: Physics2DWorld, dt: number): void {
  if (steppingPhysics2DWorlds.has(world)) {
    throw new Error('Cannot step a physics world recursively');
  }
  steppingPhysics2DWorlds.add(world);
  try {
    stepPhysics2DOnce(world, dt);
  } finally {
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
    return;
  }

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
      body.angularVelocity += body.torque * body.inverseInertia * dt;
      // Damping is applied as a multiplicative decay rather than a subtracted force so it stays stable at
      // any timestep: a force-shaped damping term large enough to matter can reverse the velocity it is
      // damping when dt is big.
      body.velocityX /= 1 + body.linearDamping * dt;
      body.velocityY /= 1 + body.linearDamping * dt;
      body.angularVelocity /= 1 + body.angularDamping * dt;
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
  for (let island = 0; island < world.solveIslandRoots.length; island++) {
    const bodyStart = world.solveIslandBodyStarts[island];
    const bodyEnd = bodyStart + world.solveIslandBodyCounts[island];
    for (let at = bodyStart; at < bodyEnd; at++) {
      const body = bodies[world.solveIslandBodyIndices[at]];
      body.x += body.velocityX * dt;
      body.y += body.velocityY * dt;
      body.angle += body.angularVelocity * dt;
    }
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

const pairScratch: SpatialPair[] = [];
const manifoldScratch: CollisionContactManifold = createCollisionContactManifold();
const defaultCollisionFilter = { categoryBits: 1, maskBits: 0xffffffff, groupIndex: 0 };

// Whether a joint between these two bodies suppresses their contact.
function isPhysics2DPairJointSuppressed(world: Readonly<Physics2DWorld>, first: number, second: number): boolean {
  for (const joint of world.joints) {
    if (joint.collideConnected) continue;
    const solver = world.jointSolvers.get(joint.kind);
    if (solver === undefined || solver.usesBodyA === false) continue;
    if ((joint.bodyA === first && joint.bodyB === second) || (joint.bodyA === second && joint.bodyB === first)) {
      return true;
    }
  }
  return false;
}
