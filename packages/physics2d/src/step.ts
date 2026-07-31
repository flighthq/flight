import { collideContactManifold, createCollisionContactManifold } from '@flighthq/collision/contract';
import type {
  CollisionContactManifold,
  Physics2DContact,
  Physics2DContactPoint,
  Physics2DWorld,
  RigidBody2D,
  SpatialAabb,
  SpatialPair,
} from '@flighthq/types/contract';

import { updatePhysics2DColliderWorldShape, writePhysics2DColliderBounds } from './colliderTransform';
import { relativeNormalVelocity, solvePhysics2DContactsOnce, warmStartPhysics2DContacts } from './solver';
import { findPhysics2DBody, isPhysics2DPairOrdered } from './world';

// Refreshes every collider's world shape and republishes its bounds to the broadphase index.
function updatePhysics2DBroadphase(world: Physics2DWorld): void {
  for (const body of world.bodies) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const collider of body.colliders) {
      updatePhysics2DColliderWorldShape(collider, body);
      writePhysics2DColliderBounds(collider, boundsScratch);
      if (boundsScratch.minX < minX) minX = boundsScratch.minX;
      if (boundsScratch.minY < minY) minY = boundsScratch.minY;
      if (boundsScratch.maxX > maxX) maxX = boundsScratch.maxX;
      if (boundsScratch.maxY > maxY) maxY = boundsScratch.maxY;
    }
    if (minX > maxX) {
      // No collider produced bounds, so there is nothing to index. Withdraw rather than skip: the id
      // may have been indexed on a previous step, and a stale AABB keeps generating pairs for a body
      // this step has already decided not to collide.
      world.index.removeSpatialObject(body.index);
      continue;
    }
    // Bounds this package declines to hand to the broadphase — a physics judgement, kept as
    // defence in depth rather than as a substitute for the index's own bound.
    //
    // `@flighthq/spatial` now bounds its own insert cost (non-finite bounds are declined with a
    // sentinel, oversized ones go to a flat overflow list), so this is no longer what stands between a
    // diverging body and a hung caller. What it still expresses is a rigid-body world's own opinion:
    // a body that is non-finite, or ten million units across, has diverged by any measure this
    // simulation cares about, and continuing to collide it wastes narrow-phase work on a result
    // already meaningless. Skipping it stops that one body colliding and lets the rest of the world
    // keep simulating.
    //
    // Keeping it also keeps the two packages honest about ownership: the cost bound is the index's,
    // and this is a divergence filter that happens to share its shape.
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY) ||
      maxX - minX > MAX_SIMULATED_EXTENT ||
      maxY - minY > MAX_SIMULATED_EXTENT
    ) {
      // Withdraw the body from the index instead of merely skipping the update. Skipping left
      // whatever AABB it had last step in place, so a body this filter had declared diverged went on
      // producing broadphase pairs and holding live contacts from its last valid pose — the opposite
      // of the "stops colliding" this comment claims. Removal is a no-op for an id never indexed.
      world.index.removeSpatialObject(body.index);
      continue;
    }
    bodyBounds.minX = minX;
    bodyBounds.minY = minY;
    bodyBounds.maxX = maxX;
    bodyBounds.maxY = maxY;
    world.index.updateSpatialObject(body.index, bodyBounds);
  }
}

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
        const sensorPair = colliderA.sensor || colliderB.sensor;
        // The immovable test belongs here, not on the bodies. Owning one sensor anywhere does not make
        // a body's other colliders reportable: a static body carrying a trigger volume plus ordinary
        // scenery would otherwise emit solid-vs-solid contacts against other static scenery, which
        // nothing can ever resolve. Sensors are reported and never resolved, so a sensor pair is the
        // only pair worth keeping between two bodies that cannot move.
        if (bothImmovable && !sensorPair) continue;
        if (!collideContactManifold(colliderA.world, colliderB.world, manifoldScratch)) continue;
        mergePhysics2DContact(
          world,
          bodyA.index,
          bodyB.index,
          i,
          j,
          manifoldScratch,
          sensorPair,
          (colliderA.material.friction + colliderB.material.friction) / 2,
          Math.max(colliderA.material.restitution, colliderB.material.restitution),
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
  contact.sensor = sensor;
  contact.touching = true;

  for (let i = 0; i < manifold.pointCount; i++) {
    const source = manifold.points[i];
    const target = contact.points[i];
    let normalImpulse = 0;
    let tangentImpulse = 0;
    for (let j = 0; j < contact.pointCount; j++) {
      if (contact.points[j].featureId === source.featureId) {
        normalImpulse = contact.points[j].normalImpulse;
        tangentImpulse = contact.points[j].tangentImpulse;
        break;
      }
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
function preparePhysics2DConstraints(world: Physics2DWorld, dt: number): void {
  const config = world.config;
  for (const contact of world.contacts) {
    if (contact.sensor) continue;
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

      // Penetration recovery, softened by a slop the solver deliberately leaves unresolved so a resting
      // contact is not fighting a target of exactly zero overlap every step.
      const excess = point.depth - config.penetrationSlop;
      point.bias = excess > 0 ? -(config.positionCorrection / dt) * excess : 0;

      // Restitution is dropped below a threshold approach speed. Without that, a ball bounces forever at
      // ever smaller amplitudes and never comes to rest.
      const approach = relativeNormalVelocity(bodyA, bodyB, point, normalX, normalY);
      if (approach < -config.restitutionThreshold) point.bias += contact.restitution * approach;
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
  if (!(dt > 0)) return;

  updatePhysics2DBroadphase(world);
  buildPhysics2DContacts(world);

  const bodies = world.bodies;
  const config = world.config;

  for (const body of bodies) {
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

  preparePhysics2DConstraints(world, dt);
  for (const joint of world.joints) {
    world.jointSolvers.get(joint.kind)?.prepare(world, joint, dt);
  }
  // Joints warm-start alongside contacts, which is what the impulse block on Physics2DJoint has always
  // been documented to be for. Each kind reapplies its own converged impulse, because the block is
  // deliberately untyped and only the kind knows what its numbers mean. With warm starting off the
  // accumulators are cleared instead, so a world told not to use the cache does not quietly keep
  // seeding from it — the previous code left them growing whether the flag was set or not.
  if (config.warmStarting) warmStartPhysics2DContacts(world);
  // Warm starting is decided per KIND as well as per world, because it is a capability and not just a
  // preference. A kind that declares no warmStart is never reapplying its accumulator — the mouse joint
  // omits it deliberately, since a target that moves between steps invalidates the previous impulse —
  // so that accumulator has to be cleared even when the world is warm starting. Keying only on the
  // world flag left the mouse's stale impulse live: after zeroing a body's velocity and moving the
  // target onto it, the next step still produced motion, contradicting the cold-start contract on the
  // type. An impulse that is never reapplied must be cleared, or it is neither warm nor cold.
  for (const joint of world.joints) {
    const solver = world.jointSolvers.get(joint.kind);
    if (solver === undefined) continue;
    if (config.warmStarting && solver.warmStart !== undefined) {
      solver.warmStart(world, joint);
    } else {
      solver.clearAccumulatedImpulses?.(joint);
    }
  }
  // Joints and contacts share one solve list and one iteration count. Solving them in separate passes
  // would let each undo the other's correction — a hinge under load creeps if the contacts beneath it get
  // a whole pass to themselves between joint iterations.
  for (let iteration = 0; iteration < config.velocityIterations; iteration++) {
    for (const joint of world.joints) {
      world.jointSolvers.get(joint.kind)?.solve(world, joint);
    }
    solvePhysics2DContactsOnce(world);
  }

  for (const body of bodies) {
    if (body.type === 'static') continue;
    body.x += body.velocityX * dt;
    body.y += body.velocityY * dt;
    body.angle += body.angularVelocity * dt;
  }

  for (const body of bodies) {
    body.forceX = 0;
    body.forceY = 0;
    body.torque = 0;
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

// The widest body this world still treats as simulating. Named for what it bounds — the simulation's
// tolerance for divergence — not for the index, which bounds its own insert cost independently.
const MAX_SIMULATED_EXTENT = 1e7;
const boundsScratch: SpatialAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const bodyBounds: SpatialAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const pairScratch: SpatialPair[] = [];
const manifoldScratch: CollisionContactManifold = createCollisionContactManifold();

// Whether a joint between these two bodies suppresses their contact.
function isPhysics2DPairJointSuppressed(world: Readonly<Physics2DWorld>, first: number, second: number): boolean {
  for (const joint of world.joints) {
    if (joint.collideConnected) continue;
    if ((joint.bodyA === first && joint.bodyB === second) || (joint.bodyA === second && joint.bodyB === first)) {
      return true;
    }
  }
  return false;
}
