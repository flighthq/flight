import { collideContactManifold3D, createCollisionContactManifold3D } from '@flighthq/collision/contract';
import type {
  CollisionContactManifold3D,
  Physics3DCollider,
  Physics3DContactIntakeGuard,
  Physics3DContact,
  Physics3DWorld,
  SpatialPair,
} from '@flighthq/types/contract';

import { synchronizePhysics3DBroadphase } from './broadphase';
import { createPhysics3DContactPoint } from './contacts';
import { isPhysics3DPairJointSuppressed } from './jointCollisionSuppression';
import { isPhysics3DPairOrdered } from './jointRegistry';
import { mixPhysics3DFriction, mixPhysics3DRestitution } from './material';
import { writeRigidBody3DWorldCenter } from './world';

// Rebuilds the world's persistent contact set from the current poses, and reports this step's begin and
// end transitions.
//
// TWO orderings are load-bearing here and they fix different problems:
//   1. Each PAIR is ordered by body index before the narrow phase is called, because the narrow phase
//      resolves contact points on the reference shape and ties toward its first argument. Reversed
//      arguments move the points and renumber their feature ids, which discards the warm-start cache.
//   2. The contact LIST is sorted, because a sequential-impulse solver is order-dependent by
//      construction — each impulse is applied against the velocities the previous ones left behind — and
//      a broadphase reports pairs in an order that follows insertion and movement history.
//
// Neither substitutes for the other: the first fixes contact identity, the second fixes solve order. A
// determinism harness that shuffles only insertion order would pass with the first one broken.
export function buildPhysics3DContacts(world: Physics3DWorld): void {
  // The diagnostics seam for the one failure this function cannot signal by its output. Null unless
  // `enablePhysics3DGuards` installed it, so a build that never enables guards links neither the check
  // nor the message text.
  physics3DIntakeGuard?.(world);
  synchronizePhysics3DBroadphase(world);

  const scratch = acquirePhysics3DIntakeScratch();
  try {
    buildPhysics3DContactsWithScratch(world, scratch);
  } finally {
    releasePhysics3DIntakeScratch(scratch);
  }
}

// Installs the optional diagnostics seam consulted before every contact rebuild. Null by default and set
// only by `enablePhysics3DGuards`.
export function setPhysics3DContactIntakeGuard(guard: Physics3DContactIntakeGuard | null): void {
  physics3DIntakeGuard = guard;
}

function buildPhysics3DContactsWithScratch(world: Physics3DWorld, scratch: Physics3DIntakeScratch): void {
  world.index.querySpatialPairs(scratch.pairs);

  world.events.began.length = 0;
  world.events.ended.length = 0;
  for (const contact of world.contacts) contact.touching = false;

  for (const pair of scratch.pairs) {
    const first = world.bodyByIndex.get(pair.a);
    const second = world.bodyByIndex.get(pair.b);
    if (first === undefined || second === undefined) continue;

    // Two bodies that cannot both move have no constraint to SOLVE, and skipping them keeps the solver's
    // list free of pairs whose every impulse would be multiplied by zero. A sensor is reported and never
    // resolved, though, so an immovable pair still matters when one side senses: a static trigger volume
    // over static scenery is an ordinary thing to build.
    const bothImmovable = first.inverseMass === 0 && second.inverseMass === 0;
    if (bothImmovable && !hasPhysics3DSensorCollider(first) && !hasPhysics3DSensorCollider(second)) continue;
    // A jointed pair almost always overlaps at the anchor, and resolving that contact fights the
    // constraint holding them together, so a joint suppresses it unless the caller asks otherwise.
    if (isPhysics3DPairJointSuppressed(world, first.index, second.index)) continue;

    const ordered = isPhysics3DPairOrdered(first.index, second.index);
    const bodyA = ordered ? first : second;
    const bodyB = ordered ? second : first;

    for (let i = 0; i < bodyA.colliders.length; i += 1) {
      for (let j = 0; j < bodyB.colliders.length; j += 1) {
        const colliderA = bodyA.colliders[i];
        const colliderB = bodyB.colliders[j];
        if (!isPhysics3DColliderPairEnabled(colliderA, colliderB)) continue;
        const sensorPair = colliderA.sensor || colliderB.sensor;
        // The immovable test belongs HERE as well as on the bodies. Owning one sensor anywhere does not
        // make a body's other colliders reportable: a static body carrying a trigger volume plus ordinary
        // scenery would otherwise emit solid-vs-solid contacts against other static scenery, which nothing
        // can ever resolve.
        if (bothImmovable && !sensorPair) continue;
        if (!collideContactManifold3D(colliderA.world, colliderB.world, scratch.manifold)) continue;
        mergePhysics3DContact(
          world,
          bodyA.index,
          bodyB.index,
          i,
          j,
          scratch.manifold,
          sensorPair,
          mixPhysics3DFriction(colliderA.material.friction, colliderB.material.friction),
          mixPhysics3DRestitution(colliderA.material.restitution, colliderB.material.restitution),
        );
      }
    }
  }

  // Contact events are read off the cache's own transitions rather than tracked beside it: the cache
  // already knows which pairs are touching, so a pair gaining an entry IS the begin and losing one IS the
  // end. An ended contact is reported for the step it leaves, then dropped.
  for (let i = world.contacts.length - 1; i >= 0; i -= 1) {
    const contact = world.contacts[i];
    if (!contact.touching) {
      world.events.ended.push(contact);
      world.contacts.splice(i, 1);
    }
  }

  world.contacts.sort(comparePhysics3DContacts);
}

// Total order over contacts by their four identity fields. Body pair first, then collider pair, so a
// compound body's several contacts against one neighbour keep a stable relative order too.
function comparePhysics3DContacts(left: Readonly<Physics3DContact>, right: Readonly<Physics3DContact>): number {
  if (left.bodyA !== right.bodyA) return left.bodyA - right.bodyA;
  if (left.bodyB !== right.bodyB) return left.bodyB - right.bodyB;
  if (left.colliderA !== right.colliderA) return left.colliderA - right.colliderA;
  return left.colliderB - right.colliderB;
}

function hasPhysics3DSensorCollider(body: Readonly<Physics3DWorld['bodies'][number]>): boolean {
  for (const collider of body.colliders) {
    if (collider.sensor) return true;
  }
  return false;
}

function isPhysics3DColliderPairEnabled(
  colliderA: Readonly<Physics3DCollider>,
  colliderB: Readonly<Physics3DCollider>,
): boolean {
  const filterA = colliderA.filter;
  const filterB = colliderB.filter;
  if (filterA.groupIndex !== 0 && filterA.groupIndex === filterB.groupIndex) return filterA.groupIndex > 0;
  return (filterA.maskBits & filterB.categoryBits) !== 0 && (filterB.maskBits & filterA.categoryBits) !== 0;
}

// Writes this step's manifold into the persistent contact for the pair, creating it if new.
//
// The point ARRAY is grown to the manifold's size once and then reused, and the geometry is copied field
// by field rather than by holding the manifold's own point objects — the manifold is scratch that the
// next collider pair overwrites, so retaining its points would give every contact in the world the last
// pair's geometry.
function mergePhysics3DContact(
  world: Physics3DWorld,
  bodyA: number,
  bodyB: number,
  colliderA: number,
  colliderB: number,
  manifold: Readonly<CollisionContactManifold3D>,
  sensor: boolean,
  friction: number,
  restitution: number,
): void {
  let contact: Physics3DContact | null = null;
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
    contact = {
      bodyA,
      bodyB,
      colliderA,
      colliderB,
      normalX: 0,
      normalY: 0,
      normalZ: 0,
      pointCount: 0,
      points: [],
      friction,
      restitution,
      enabled: true,
      sensor,
      touching: true,
    };
    world.contacts.push(contact);
    world.events.began.push(contact);
  }

  contact.normalX = manifold.normalX;
  contact.normalY = manifold.normalY;
  contact.normalZ = manifold.normalZ;
  contact.friction = friction;
  contact.restitution = restitution;
  contact.enabled = true;
  contact.sensor = sensor;
  contact.touching = true;

  // Warm starting needs no snapshot-and-rematch here, unlike the 2D package: the 3D solver holds its
  // accumulators in `Physics3DContactConstraintPoint` rather than on the contact point, and matches them
  // by `featureId` itself. The contact carries geometry and identity only, so overwriting it in place
  // destroys nothing the next warm start needs.
  while (contact.points.length < manifold.pointCount) contact.points.push(createPhysics3DContactPoint());
  const centerA = writePhysics3DBodyCenter(world, bodyA, scratchCenterA);
  const centerB = writePhysics3DBodyCenter(world, bodyB, scratchCenterB);
  for (let i = 0; i < manifold.pointCount; i += 1) {
    const source = manifold.points[i];
    const target = contact.points[i];
    target.x = source.x;
    target.y = source.y;
    target.z = source.z;
    target.depth = source.depth;
    target.featureId = source.featureId;
    // The lever arms are measured from each body's CENTRE OF MASS, not its origin. An offset collider on
    // a body whose centre is elsewhere is exactly the case the two differ, and using the origin gives the
    // contact a torque arm the body does not have.
    target.rAX = source.x - centerA[0];
    target.rAY = source.y - centerA[1];
    target.rAZ = source.z - centerA[2];
    target.rBX = source.x - centerB[0];
    target.rBY = source.y - centerB[1];
    target.rBZ = source.z - centerB[2];
  }
  contact.pointCount = manifold.pointCount;
}

function writePhysics3DBodyCenter(world: Readonly<Physics3DWorld>, index: number, out: number[]): number[] {
  const body = world.bodyByIndex.get(index);
  if (body === undefined) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return out;
  }
  writeRigidBody3DWorldCenter(body, out);
  return out;
}

interface Physics3DIntakeScratch {
  pairs: SpatialPair[];
  manifold: CollisionContactManifold3D;
}

function acquirePhysics3DIntakeScratch(): Physics3DIntakeScratch {
  return physics3DIntakeScratchPool.pop() ?? createPhysics3DIntakeScratch();
}

function createPhysics3DIntakeScratch(): Physics3DIntakeScratch {
  return { pairs: [], manifold: createCollisionContactManifold3D() };
}

function releasePhysics3DIntakeScratch(scratch: Physics3DIntakeScratch): void {
  physics3DIntakeScratchPool.push(scratch);
}

const physics3DIntakeScratchPool: Physics3DIntakeScratch[] = [createPhysics3DIntakeScratch()];

let physics3DIntakeGuard: Physics3DContactIntakeGuard | null = null;

const scratchCenterA = [0, 0, 0];
const scratchCenterB = [0, 0, 0];
