import { createUniformGridSpatialBackend } from '@flighthq/spatial/contract';
import type {
  CollisionShape,
  Physics2DCollisionFilter,
  Physics2DCollider,
  Physics2DMaterial,
  Physics2DSolverConfig,
  Physics2DWorld,
  RigidBody2D,
  SpatialIndexBackend,
} from '@flighthq/types/contract';

import { createPhysics2DColliderWorldShape } from './colliderTransform';
import { updateRigidBody2DMassData } from './massProperties';

// Adds `body` to `world`, assigning it the persistent index every contact is keyed and ordered by, and
// returns it. The index comes from a monotonic counter rather than the array position, so removing a
// body can never hand its identity to a later one — a stale contact would otherwise be revived against
// whichever body inherited the slot, warm-starting it with a force that belonged to something else.
export function addPhysics2DBody(world: Physics2DWorld, body: RigidBody2D): RigidBody2D {
  body.index = world.nextBodyIndex++;
  world.bodies.push(body);
  updateRigidBody2DMassData(body);
  return body;
}

// Creates a collider from a LOCAL-space shape, allocating the world-space shape it will be transformed
// into. Both shapes exist for the collider's lifetime; the step rewrites the world one in place.
export function createPhysics2DCollider(
  local: CollisionShape,
  material: Physics2DMaterial,
  sensor = false,
  filter?: Readonly<Physics2DCollisionFilter>,
): Physics2DCollider {
  return {
    local,
    world: createPhysics2DColliderWorldShape(local),
    material,
    filter: filter === undefined ? { categoryBits: 1, maskBits: 0xffffffff, groupIndex: 0 } : { ...filter },
    sensor,
  };
}

// The default solver tuning. Ten velocity iterations and three position iterations is the range every
// sequential-impulse engine converges on for game-scale stacks; the slop and correction factor are what
// stop a resting contact from either twitching against a target of exactly zero overlap or exploding
// outward when a deep overlap is corrected all at once.
export function createPhysics2DSolverConfig(): Physics2DSolverConfig {
  return {
    // Box2D's long-standing defaults: still below 0.01 m/s and 2 deg/s, asleep after half a second.
    allowSleeping: true,
    sleepLinearThreshold: 0.01,
    sleepAngularThreshold: (2 * Math.PI) / 180,
    timeToSleep: 0.5,
    velocityIterations: 10,
    positionIterations: 3,
    penetrationSlop: 0.005,
    positionCorrection: 0.2,
    restitutionThreshold: 1,
    warmStarting: true,
  };
}

// Creates an empty world. `index` defaults to a uniform grid; pass one to swap the broadphase structure
// without this package knowing which it got — `SpatialIndexBackend` is already that seam, so physics
// adds no second one over it.
export function createPhysics2DWorld(gravityX = 0, gravityY = -9.81, index?: SpatialIndexBackend): Physics2DWorld {
  return {
    bodies: [],
    contacts: [],
    joints: [],
    jointSolvers: new Map(),
    events: { began: [], ended: [] },
    contactHooks: { preSolve: null, postSolve: null },
    index: index ?? createUniformGridSpatialBackend(1),
    config: createPhysics2DSolverConfig(),
    gravityX,
    gravityY,
    nextBodyIndex: 0,
  };
}

// Creates a rigid body at rest. Mass properties stay zero until the body is added to a world, which
// derives them from the colliders — a body's mass is never assigned, only derived, so it cannot
// disagree with its shape.
export function createRigidBody2D(type: RigidBody2D['type'], x: number, y: number, angle = 0): RigidBody2D {
  return {
    index: -1,
    type,
    x,
    y,
    angle,
    velocityX: 0,
    velocityY: 0,
    angularVelocity: 0,
    forceX: 0,
    forceY: 0,
    torque: 0,
    mass: 0,
    inverseMass: 0,
    inertia: 0,
    inverseInertia: 0,
    centerX: 0,
    centerY: 0,
    linearDamping: 0,
    angularDamping: 0,
    gravityScale: 1,
    sleeping: false,
    sleepTimer: 0,
    colliders: [],
  };
}

// The body carrying `index`, or null when the world no longer holds it. Contacts store body indices
// rather than references so a contact can outlive one step without pinning a removed body alive; this is
// the lookup that turns one back into the other.
export function findPhysics2DBody(world: Readonly<Physics2DWorld>, index: number): RigidBody2D | null {
  for (const body of world.bodies) {
    if (body.index === index) return body;
  }
  return null;
}

// The canonical order of a body pair: lower index first. Every contact in the world is created through
// this, which is what discharges the ordering obligation `@flighthq/collision` cannot.
//
// Collision resolves contact points on the reference shape's surface and, for two shapes of the same
// kind, ties toward its first argument — so passing a pair the other way round moves the points to the
// opposite surface and renumbers their feature ids. Broadphase pair order follows insertion and movement
// history, so without a canonical order the warm-start cache silently resets whenever a body is added
// mid-simulation. The order has to come from persistent identity rather than geometry, because any order
// derived from coordinates flips the moment those coordinates cross.
//
// It returns a boolean rather than sorting in place so the caller keeps both the ordered pair and the
// knowledge of whether it was reversed, which the collider indices must follow.
export function isPhysics2DPairOrdered(a: Readonly<RigidBody2D>, b: Readonly<RigidBody2D>): boolean {
  return a.index <= b.index;
}

// Removes `body` from `world`, along with every contact naming it. Contacts are dropped rather than
// kept, because a contact whose body is gone has no constraint to solve and its cached impulse belongs
// to a pair that no longer exists.
export function removePhysics2DBody(world: Physics2DWorld, body: Readonly<RigidBody2D>): boolean {
  const at = world.bodies.indexOf(body as RigidBody2D);
  if (at < 0) return false;
  world.bodies.splice(at, 1);
  world.index.removeSpatialObject(body.index);
  for (let i = world.contacts.length - 1; i >= 0; i--) {
    const contact = world.contacts[i];
    if (contact.bodyA === body.index || contact.bodyB === body.index) world.contacts.splice(i, 1);
  }
  // Joints naming the removed body go with it: a constraint with one end missing has nothing to solve
  // against, and leaving it would let a later body inheriting the index be silently constrained by it.
  for (let i = world.joints.length - 1; i >= 0; i--) {
    const joint = world.joints[i];
    if (joint.bodyA === body.index || joint.bodyB === body.index) world.joints.splice(i, 1);
  }
  return true;
}
