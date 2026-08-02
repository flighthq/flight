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

import { synchronizePhysics2DBroadphase } from './broadphase';
import { createPhysics2DColliderWorldShape } from './colliderTransform';
import { updateRigidBody2DMassData } from './massProperties';
import { physics2DBodyOwners, physics2DColliderOwners, physics2DJointOwners } from './ownership';

// Adds `body` to `world`, assigning it the persistent index every contact is keyed and ordered by, and
// returns it. The index comes from a monotonic counter rather than the array position, so removing a
// body can never hand its identity to a later one — a stale contact would otherwise be revived against
// whichever body inherited the slot, warm-starting it with a force that belonged to something else.
export function addPhysics2DBody(world: Physics2DWorld, body: RigidBody2D): RigidBody2D {
  if (physics2DBodyOwners.has(body) || body.index !== -1 || world.bodies.includes(body)) {
    throw new Error('Cannot add a rigid body that already belongs to a physics world');
  }
  const colliders = new Set<Physics2DCollider>();
  for (const collider of body.colliders) {
    if (colliders.has(collider)) throw new Error('Cannot add a rigid body containing the same collider twice');
    colliders.add(collider);
    const owner = physics2DColliderOwners.get(collider);
    if (owner !== undefined && owner !== body) {
      throw new Error('Cannot share a physics collider between rigid bodies');
    }
  }

  body.index = world.nextBodyIndex++;
  world.bodies.push(body);
  world.bodyByIndex.set(body.index, body);
  physics2DBodyOwners.set(body, world);
  for (const collider of colliders) physics2DColliderOwners.set(collider, body);
  updateRigidBody2DMassData(body);
  return body;
}

// Adds a collider while keeping every derived world structure coherent. A body may still be authored
// before insertion: in that case only its collider list and mass data change. Once it belongs to the
// world, topology mutation also discards stale contact impulses, wakes affected bodies, and republishes
// bounds immediately rather than waiting for the next step.
export function addPhysics2DCollider(
  world: Physics2DWorld,
  body: RigidBody2D,
  collider: Physics2DCollider,
): Physics2DCollider {
  const bodyOwner = physics2DBodyOwners.get(body);
  if (bodyOwner !== undefined && bodyOwner !== world) {
    throw new Error('Cannot mutate a rigid body through a physics world that does not own it');
  }
  if (body.colliders.includes(collider)) {
    throw new Error('Cannot add the same physics collider to a rigid body twice');
  }
  const owner = physics2DColliderOwners.get(collider);
  if (owner !== undefined && owner !== body) {
    throw new Error('Cannot share a physics collider between rigid bodies');
  }
  const inWorld = world.bodyByIndex.get(body.index) === body;
  if (inWorld) _invalidatePhysics2DBodyConstraints(world, body.index);
  body.colliders.push(collider);
  physics2DColliderOwners.set(collider, body);
  updateRigidBody2DMassData(body);
  if (inWorld) {
    _wakePhysics2DBodyFromTopology(body);
    synchronizePhysics2DBroadphase(world);
  }
  return collider;
}

// Accumulates a world-space force at the centre of mass for the next step. Forces belong only to
// dynamic bodies; returning false makes an ignored static/kinematic or non-finite action observable.
export function applyPhysics2DForce(body: RigidBody2D, forceX: number, forceY: number): boolean {
  if (body.type !== 'dynamic' || !Number.isFinite(forceX) || !Number.isFinite(forceY)) return false;
  body.forceX += forceX;
  body.forceY += forceY;
  if (forceX !== 0 || forceY !== 0) _wakePhysics2DBodyFromTopology(body);
  return true;
}

// Accumulates a world-space force at a world-space point, including its moment about the current centre
// of mass. Keeping the coordinate space in the name-level contract avoids a local/world ambiguity.
export function applyPhysics2DForceAtPoint(
  body: RigidBody2D,
  forceX: number,
  forceY: number,
  pointX: number,
  pointY: number,
): boolean {
  if (
    body.type !== 'dynamic' ||
    !Number.isFinite(forceX) ||
    !Number.isFinite(forceY) ||
    !Number.isFinite(pointX) ||
    !Number.isFinite(pointY)
  ) {
    return false;
  }
  body.forceX += forceX;
  body.forceY += forceY;
  body.torque += _crossPhysics2DBodyPointVector(body, pointX, pointY, forceX, forceY);
  if (forceX !== 0 || forceY !== 0) _wakePhysics2DBodyFromTopology(body);
  return true;
}

// Applies an instantaneous world-space impulse at the centre of mass. Unlike force, an impulse changes
// velocity immediately and is not cleared at the end of the next step.
export function applyPhysics2DLinearImpulse(body: RigidBody2D, impulseX: number, impulseY: number): boolean {
  if (body.type !== 'dynamic' || !Number.isFinite(impulseX) || !Number.isFinite(impulseY)) return false;
  body.velocityX += impulseX * body.inverseMass;
  body.velocityY += impulseY * body.inverseMass;
  if (impulseX !== 0 || impulseY !== 0) _wakePhysics2DBodyFromTopology(body);
  return true;
}

// Applies an instantaneous world-space impulse at a world-space point, changing both linear and angular
// velocity from the body's derived inverse mass properties.
export function applyPhysics2DLinearImpulseAtPoint(
  body: RigidBody2D,
  impulseX: number,
  impulseY: number,
  pointX: number,
  pointY: number,
): boolean {
  if (
    body.type !== 'dynamic' ||
    !Number.isFinite(impulseX) ||
    !Number.isFinite(impulseY) ||
    !Number.isFinite(pointX) ||
    !Number.isFinite(pointY)
  ) {
    return false;
  }
  body.velocityX += impulseX * body.inverseMass;
  body.velocityY += impulseY * body.inverseMass;
  body.angularVelocity +=
    _crossPhysics2DBodyPointVector(body, pointX, pointY, impulseX, impulseY) * body.inverseInertia;
  if (impulseX !== 0 || impulseY !== 0) _wakePhysics2DBodyFromTopology(body);
  return true;
}

// Accumulates torque for the next step and wakes the body so the integrator cannot swallow it.
export function applyPhysics2DTorque(body: RigidBody2D, torque: number): boolean {
  if (body.type !== 'dynamic' || !Number.isFinite(torque)) return false;
  body.torque += torque;
  if (torque !== 0) _wakePhysics2DBodyFromTopology(body);
  return true;
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
    bodyByIndex: new Map(),
    contacts: [],
    joints: [],
    jointSolvers: new Map(),
    events: { began: [], ended: [] },
    contactHooks: { preSolve: null, postSolve: null },
    index: index ?? createUniformGridSpatialBackend(1),
    config: createPhysics2DSolverConfig(),
    gravityX,
    gravityY,
    previousTimestep: 0,
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
  return world.bodyByIndex.get(index) ?? null;
}

// Rebuilds everything derived from a collider after its authored shape, material, filter, or sensor
// state changes. The caller owns those plain-data fields; this explicit invalidation point keeps mutation
// cheap while making the necessary cache boundary impossible to mistake for an ordinary assignment.
export function invalidatePhysics2DCollider(
  world: Physics2DWorld,
  body: RigidBody2D,
  collider: Physics2DCollider,
): boolean {
  const bodyOwner = physics2DBodyOwners.get(body);
  if (bodyOwner !== undefined && bodyOwner !== world) return false;
  if (body.colliders.indexOf(collider) < 0) return false;
  const inWorld = world.bodyByIndex.get(body.index) === body;
  if (inWorld) _invalidatePhysics2DBodyConstraints(world, body.index);
  collider.world = createPhysics2DColliderWorldShape(collider.local);
  updateRigidBody2DMassData(body);
  if (inWorld) {
    _wakePhysics2DBodyFromTopology(body);
    synchronizePhysics2DBroadphase(world);
  }
  return true;
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
  // Removing one end invalidates every constraint it participated in. Wake the surviving ends BEFORE
  // dropping those edges: a crate asleep on deleted ground otherwise remains suspended forever, since
  // gravity is integrated only for awake bodies and the contact that could have joined it to an awake
  // island is already gone. Sensors transmit no impulse and unknown joints constrain nothing, so neither
  // is a wake edge.
  _invalidatePhysics2DBodyContacts(world, body.index);
  // Joints naming the removed body go with it: a constraint with one end missing has nothing to solve
  // against, and leaving it would let a later body inheriting the index be silently constrained by it.
  for (let i = world.joints.length - 1; i >= 0; i--) {
    const joint = world.joints[i];
    const solver = world.jointSolvers.get(joint.kind);
    const usesBodyA = solver?.usesBodyA !== false;
    const removesBodyA = usesBodyA && joint.bodyA === body.index;
    const removesBodyB = joint.bodyB === body.index;
    if (!removesBodyA && !removesBodyB) continue;
    if (solver !== undefined && usesBodyA) {
      const otherIndex = removesBodyA ? joint.bodyB : joint.bodyA;
      const other = findPhysics2DBody(world, otherIndex);
      if (other !== null) _wakePhysics2DBodyFromTopology(other);
    }
    world.joints.splice(i, 1);
    physics2DJointOwners.delete(joint);
  }
  world.bodyByIndex.delete(body.index);
  world.bodies.splice(at, 1);
  world.index.removeSpatialObject(body.index);
  const mutableBody = body as RigidBody2D;
  mutableBody.index = -1;
  physics2DBodyOwners.delete(mutableBody);
  return true;
}

// Removes one collider and updates all state derived from the body's collider array. Every contact on
// the body is invalidated, not only the removed collider's: removing an earlier array entry renumbers
// later collider indices, and any mass change moves the centre used by every cached contact lever arm.
export function removePhysics2DCollider(
  world: Physics2DWorld,
  body: RigidBody2D,
  collider: Readonly<Physics2DCollider>,
): boolean {
  const bodyOwner = physics2DBodyOwners.get(body);
  if (bodyOwner !== undefined && bodyOwner !== world) return false;
  const at = body.colliders.indexOf(collider as Physics2DCollider);
  if (at < 0) return false;
  const inWorld = world.bodyByIndex.get(body.index) === body;
  if (inWorld) _invalidatePhysics2DBodyConstraints(world, body.index);
  body.colliders.splice(at, 1);
  physics2DColliderOwners.delete(collider as Physics2DCollider);
  updateRigidBody2DMassData(body);
  if (inWorld) {
    _wakePhysics2DBodyFromTopology(body);
    synchronizePhysics2DBroadphase(world);
  }
  return true;
}

// Teleports a world body and immediately republishes its bounds. Contacts and joint warm-start impulses
// describe the old pose, so they are invalidated before the transform changes and connected sleepers
// are woken to respond to the new configuration.
export function setPhysics2DBodyTransform(
  world: Physics2DWorld,
  body: RigidBody2D,
  x: number,
  y: number,
  angle: number,
): boolean {
  if (
    world.bodyByIndex.get(body.index) !== body ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(angle)
  ) {
    return false;
  }
  if (body.x === x && body.y === y && body.angle === angle) return true;
  _invalidatePhysics2DBodyConstraints(world, body.index);
  body.x = x;
  body.y = y;
  body.angle = angle;
  _wakePhysics2DBodyFromTopology(body);
  synchronizePhysics2DBroadphase(world);
  return true;
}

// Changes how a body participates while keeping mass properties, force state, cached constraints, and
// sleep state coherent. The body must belong to `world`; pre-insertion authoring may assign `type`
// directly because no derived world state exists yet.
export function setPhysics2DBodyType(world: Physics2DWorld, body: RigidBody2D, type: RigidBody2D['type']): boolean {
  if (world.bodyByIndex.get(body.index) !== body) return false;
  if (body.type === type) return true;
  _invalidatePhysics2DBodyConstraints(world, body.index);
  body.type = type;
  updateRigidBody2DMassData(body);
  if (type !== 'dynamic') {
    body.forceX = 0;
    body.forceY = 0;
    body.torque = 0;
  }
  if (type === 'static') {
    body.velocityX = 0;
    body.velocityY = 0;
    body.angularVelocity = 0;
  }
  _wakePhysics2DBodyFromTopology(body);
  return true;
}

function _crossPhysics2DBodyPointVector(
  body: Readonly<RigidBody2D>,
  pointX: number,
  pointY: number,
  vectorX: number,
  vectorY: number,
): number {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  const centerX = body.x + body.centerX * cos - body.centerY * sin;
  const centerY = body.y + body.centerX * sin + body.centerY * cos;
  return (pointX - centerX) * vectorY - (pointY - centerY) * vectorX;
}

function _invalidatePhysics2DBodyConstraints(world: Physics2DWorld, bodyIndex: number): void {
  _invalidatePhysics2DBodyContacts(world, bodyIndex);
  for (const joint of world.joints) {
    const solver = world.jointSolvers.get(joint.kind);
    const usesBodyA = solver?.usesBodyA !== false;
    const connectedA = usesBodyA && joint.bodyA === bodyIndex;
    const connectedB = joint.bodyB === bodyIndex;
    if (!connectedA && !connectedB) continue;
    solver?.clearAccumulatedImpulses?.(joint);
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
    if (solver === undefined || !usesBodyA) continue;
    const otherIndex = connectedA ? joint.bodyB : joint.bodyA;
    if (otherIndex === bodyIndex) continue;
    const other = findPhysics2DBody(world, otherIndex);
    if (other !== null) _wakePhysics2DBodyFromTopology(other);
  }
}

function _invalidatePhysics2DBodyContacts(world: Physics2DWorld, bodyIndex: number): void {
  for (let i = world.contacts.length - 1; i >= 0; i--) {
    const contact = world.contacts[i];
    if (contact.bodyA !== bodyIndex && contact.bodyB !== bodyIndex) continue;
    if (contact.enabled && !contact.sensor) {
      const otherIndex = contact.bodyA === bodyIndex ? contact.bodyB : contact.bodyA;
      const other = findPhysics2DBody(world, otherIndex);
      if (other !== null) _wakePhysics2DBodyFromTopology(other);
    }
    world.contacts.splice(i, 1);
  }
  _removePhysics2DContactEventsForBody(world.events.began, bodyIndex);
  _removePhysics2DContactEventsForBody(world.events.ended, bodyIndex);
}

function _removePhysics2DContactEventsForBody(events: Physics2DWorld['events']['began'], bodyIndex: number): void {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].bodyA === bodyIndex || events[i].bodyB === bodyIndex) events.splice(i, 1);
  }
}

// Kept local rather than importing islands.ts, which already resolves bodies through this module.
// Topology only needs the public wake operation's two-field invariant.
function _wakePhysics2DBodyFromTopology(body: RigidBody2D): void {
  body.sleeping = false;
  body.sleepTimer = 0;
}
