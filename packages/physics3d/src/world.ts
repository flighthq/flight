import type {
  Physics3DBodyType,
  Physics3DSequentialImpulseConfig,
  Physics3DSolverConfig,
  Physics3DWorld,
  RigidBody3D,
} from '@flighthq/types/contract';

import { refreshRigidBody3DWorldInertia } from './integrate';
import { createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';

// World and body lifecycle: allocation, membership, and the mutations that have to run through a
// function because something derived follows from them.
//
// A bare field assignment is the API wherever nothing follows from it — writing `body.linearDamping`
// is complete on its own. The setters here exist only where they are not: changing a body's type
// changes its inverse mass, teleporting it invalidates its world-space inertia, and both would leave a
// world quietly inconsistent if left to assignment.

// Adds an already-created body to the world and assigns its persistent index. Returns the index.
//
// The index comes from the world's monotonic counter rather than the body array's length, so removing
// a body never lets a later one inherit its identity — which is what stops a stale contact or joint
// from being revived against a different body that happened to take its slot.
export function addPhysics3DBody(world: Physics3DWorld, body: RigidBody3D): number {
  if (world.bodyByIndex.has(body.index) && world.bodyByIndex.get(body.index) === body) return body.index;

  body.index = world.nextBodyIndex;
  world.nextBodyIndex += 1;
  world.bodies.push(body);
  world.bodyByIndex.set(body.index, body);
  refreshRigidBody3DWorldInertia(body);
  return body.index;
}

// Accumulates a force at the body's centre of mass, to be consumed by the next step. Ignored for a
// body that cannot respond to one.
export function applyPhysics3DForce(body: RigidBody3D, x: number, y: number, z: number): void {
  if (body.type !== 'dynamic') return;
  wakePhysics3DBody(body);
  body.forceX += x;
  body.forceY += y;
  body.forceZ += z;
}

// Accumulates a force at a world-space point, which produces both a force at the centre of mass and the
// torque of its lever arm. This is the difference between pushing a crate and spinning it.
export function applyPhysics3DForceAtPoint(
  body: RigidBody3D,
  x: number,
  y: number,
  z: number,
  pointX: number,
  pointY: number,
  pointZ: number,
): void {
  if (body.type !== 'dynamic') return;
  wakePhysics3DBody(body);
  body.forceX += x;
  body.forceY += y;
  body.forceZ += z;

  writeRigidBody3DWorldCenter(body, scratchCenter);
  const rX = pointX - scratchCenter[0];
  const rY = pointY - scratchCenter[1];
  const rZ = pointZ - scratchCenter[2];
  body.torqueX += rY * z - rZ * y;
  body.torqueY += rZ * x - rX * z;
  body.torqueZ += rX * y - rY * x;
}

// Applies an instantaneous change in momentum at the centre of mass, bypassing the force accumulator.
// An impulse is what a jump or a hit is: a velocity change now, not a force integrated over the step.
export function applyPhysics3DLinearImpulse(body: RigidBody3D, x: number, y: number, z: number): void {
  if (body.type !== 'dynamic' || body.inverseMass === 0) return;
  wakePhysics3DBody(body);
  body.velocityX += x * body.inverseMass;
  body.velocityY += y * body.inverseMass;
  body.velocityZ += z * body.inverseMass;
}

// Accumulates a torque about the centre of mass, to be consumed by the next step.
export function applyPhysics3DTorque(body: RigidBody3D, x: number, y: number, z: number): void {
  if (body.type !== 'dynamic') return;
  wakePhysics3DBody(body);
  body.torqueX += x;
  body.torqueY += y;
  body.torqueZ += z;
}

// The default sequential-impulse tuning. Eight velocity iterations and three position iterations are
// the values a Box2D-lineage solver converges acceptably at for ordinary scenes; a scene of tall stacks
// wants more of the first, and one with deep initial overlap more of the second.
export function createPhysics3DSequentialImpulseConfig(): Physics3DSequentialImpulseConfig {
  return {
    velocityIterations: 8,
    positionIterations: 3,
    penetrationSlop: 0.005,
    positionCorrection: 0.2,
    restitutionThreshold: 1,
    warmStarting: true,
  };
}

// The default solver tuning. `substeps` is 1, which reproduces a single discrete step per call.
export function createPhysics3DSolverConfig(): Physics3DSolverConfig {
  return {
    allowSleeping: true,
    sleepLinearThreshold: 0.01,
    sleepAngularThreshold: 0.02,
    timeToSleep: 0.5,
    substeps: 1,
    continuousCollision: false,
    maxCcdSubsteps: 4,
    sequentialImpulse: createPhysics3DSequentialImpulseConfig(),
  };
}

// Allocates an empty world under earth gravity along -Y.
//
// The world owns no broadphase index, unlike `Physics2DWorld`. That is not an omission to be filled by
// a physics-specific seam: `SpatialIndexBackend` is the swap point and its 3D counterpart does not
// exist yet, so contacts are supplied by the caller until it does.
export function createPhysics3DWorld(): Physics3DWorld {
  return {
    version: Physics3DWorldVersion,
    bodies: [],
    bodyByIndex: new Map(),
    contacts: [],
    joints: [],
    jointSolvers: new Map(),
    jointCollisionSuppressions: new Map(),
    events: { began: [], ended: [] },
    contactHooks: { preSolve: null, postSolve: null },
    solver: { constraints: [], constraintByPair: new Map() },
    config: createPhysics3DSolverConfig(),
    islandParents: new Map(),
    islandSleepTimers: new Map(),
    solveIslandByRoot: new Map(),
    solveIslandRoots: [],
    solveIslandBodyStarts: [],
    solveIslandBodyCounts: [],
    solveIslandContactStarts: [],
    solveIslandContactCounts: [],
    solveIslandJointStarts: [],
    solveIslandJointCounts: [],
    solveIslandBodyIndices: [],
    solveIslandContactIndices: [],
    solveIslandJointIndices: [],
    solveIslandCursors: [],
    gravityX: 0,
    gravityY: -9.80665,
    gravityZ: 0,
    previousTimestep: 0,
    nextBodyIndex: 0,
  };
}

// Allocates a body at rest at the origin, with no mass. It is not in any world until added, and it will
// not move until given mass: a dynamic body with zero mass carries a zero inverse mass, which is the
// same immovable sentinel a static body carries.
export function createRigidBody3D(type: Physics3DBodyType = 'dynamic'): RigidBody3D {
  return {
    index: -1,
    type,
    x: 0,
    y: 0,
    z: 0,
    orientationX: 0,
    orientationY: 0,
    orientationZ: 0,
    orientationW: 1,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    angularVelocityX: 0,
    angularVelocityY: 0,
    angularVelocityZ: 0,
    forceX: 0,
    forceY: 0,
    forceZ: 0,
    torqueX: 0,
    torqueY: 0,
    torqueZ: 0,
    mass: 0,
    inverseMass: 0,
    inertiaXX: 0,
    inertiaYY: 0,
    inertiaZZ: 0,
    inertiaXY: 0,
    inertiaXZ: 0,
    inertiaYZ: 0,
    inverseInertiaXX: 0,
    inverseInertiaYY: 0,
    inverseInertiaZZ: 0,
    inverseInertiaXY: 0,
    inverseInertiaXZ: 0,
    inverseInertiaYZ: 0,
    inverseInertiaWorldXX: 0,
    inverseInertiaWorldYY: 0,
    inverseInertiaWorldZZ: 0,
    inverseInertiaWorldXY: 0,
    inverseInertiaWorldXZ: 0,
    inverseInertiaWorldYZ: 0,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    linearDamping: 0,
    angularDamping: 0,
    gravityScale: 1,
    fixedRotation: false,
    bullet: false,
    sleeping: false,
    sleepEnabled: true,
    sleepTimer: 0,
    material: { density: 1, friction: 0.2, restitution: 0 },
    filter: { categoryBits: 1, maskBits: 0xffff, groupIndex: 0 },
  };
}

// Looks a body up by its persistent index, or null when no body in this world carries it. The
// expected-failure sentinel: a caller holding an index across a removal gets null, not a throw.
export function findPhysics3DBody(world: Physics3DWorld, index: number): RigidBody3D | null {
  return world.bodyByIndex.get(index) ?? null;
}

// Removes a body and every contact and joint that referenced it. Returns false when the body is not in
// this world.
//
// Constraints go with it because a contact naming a removed body would resolve to null inside a solver
// loop, and the alternative — a null check per constraint per iteration — pays on every step for a case
// that only arises at removal.
export function removePhysics3DBody(world: Physics3DWorld, body: RigidBody3D): boolean {
  const at = world.bodies.indexOf(body);
  if (at < 0) return false;

  world.bodies.splice(at, 1);
  world.bodyByIndex.delete(body.index);

  const index = body.index;
  for (let i = world.contacts.length - 1; i >= 0; i--) {
    const contact = world.contacts[i];
    if (contact.bodyA === index || contact.bodyB === index) world.contacts.splice(i, 1);
  }
  for (let i = world.joints.length - 1; i >= 0; i--) {
    const joint = world.joints[i];
    if (joint.bodyA === index || joint.bodyB === index) world.joints.splice(i, 1);
  }
  world.solver.constraintByPair.clear();
  return true;
}

// Opts a dynamic body into or out of rotating at all, rebuilding its inverse inertia.
//
// A fixed-rotation body keeps its translational mass and exposes a zero inverse inertia tensor to every
// contact and joint equation — the same sentinel a static body uses, applied to rotation alone. Its
// angular velocity is cleared, because leaving one behind would let a body that cannot be rotated by
// anything keep spinning forever from whatever it had before.
export function setPhysics3DBodyFixedRotation(body: RigidBody3D, fixedRotation: boolean): void {
  if (body.fixedRotation === fixedRotation) return;
  body.fixedRotation = fixedRotation;
  if (fixedRotation) {
    body.angularVelocityX = 0;
    body.angularVelocityY = 0;
    body.angularVelocityZ = 0;
  }
  refreshRigidBody3DMass(body);
}

// Teleports a body, refreshing the world-space inertia its new orientation implies.
//
// The quaternion is normalized on the way in rather than trusted: a caller composing one from euler
// angles or interpolating between two will hand over something fractionally off the unit sphere, and
// every rotation downstream would inherit the error.
export function setPhysics3DBodyTransform(
  body: RigidBody3D,
  x: number,
  y: number,
  z: number,
  orientationX: number,
  orientationY: number,
  orientationZ: number,
  orientationW: number,
): void {
  body.x = x;
  body.y = y;
  body.z = z;

  const lengthSquared =
    orientationX * orientationX +
    orientationY * orientationY +
    orientationZ * orientationZ +
    orientationW * orientationW;
  if (lengthSquared > 0) {
    const scale = 1 / Math.sqrt(lengthSquared);
    body.orientationX = orientationX * scale;
    body.orientationY = orientationY * scale;
    body.orientationZ = orientationZ * scale;
    body.orientationW = orientationW * scale;
  } else {
    body.orientationX = 0;
    body.orientationY = 0;
    body.orientationZ = 0;
    body.orientationW = 1;
  }

  wakePhysics3DBody(body);
  refreshRigidBody3DWorldInertia(body);
}

// Changes how a body participates, rebuilding the mass properties that follow from it.
//
// Leaving a body's velocity behind when it becomes static would strand motion nothing can consume, so
// the velocities are cleared; becoming dynamic keeps them, since a body that was being pushed as
// kinematic is plausibly still moving.
export function setPhysics3DBodyType(body: RigidBody3D, type: Physics3DBodyType): void {
  if (body.type === type) return;
  body.type = type;
  if (type === 'static') {
    body.velocityX = 0;
    body.velocityY = 0;
    body.velocityZ = 0;
    body.angularVelocityX = 0;
    body.angularVelocityY = 0;
    body.angularVelocityZ = 0;
    body.sleeping = false;
  }
  body.forceX = 0;
  body.forceY = 0;
  body.forceZ = 0;
  body.torqueX = 0;
  body.torqueY = 0;
  body.torqueZ = 0;
  refreshRigidBody3DMass(body);
  refreshRigidBody3DWorldInertia(body);
}

// Wakes a body and resets its stillness timer. A no-op for a static body, which is neither awake nor
// asleep.
export function wakePhysics3DBody(body: RigidBody3D): void {
  if (body.type === 'static') return;
  body.sleeping = false;
  body.sleepTimer = 0;
}

// Writes the body's centre of mass in WORLD space into `out`, rotating the local centre by the body's
// orientation and adding its position. The lever arm for every force and contact starts here.
export function writeRigidBody3DWorldCenter(body: Readonly<RigidBody3D>, out: number[]): void {
  const cX = body.centerX;
  const cY = body.centerY;
  const cZ = body.centerZ;

  if (cX === 0 && cY === 0 && cZ === 0) {
    out[0] = body.x;
    out[1] = body.y;
    out[2] = body.z;
    return;
  }

  // Rotate by the quaternion as `v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)`.
  const qX = body.orientationX;
  const qY = body.orientationY;
  const qZ = body.orientationZ;
  const qW = body.orientationW;
  const tX = qY * cZ - qZ * cY + qW * cX;
  const tY = qZ * cX - qX * cZ + qW * cY;
  const tZ = qX * cY - qY * cX + qW * cZ;

  out[0] = body.x + cX + 2 * (qY * tZ - qZ * tY);
  out[1] = body.y + cY + 2 * (qZ * tX - qX * tZ);
  out[2] = body.z + cZ + 2 * (qX * tY - qY * tX);
}

// The serializable-shape version of `Physics3DWorld`. Bumped when a field a format layer would have
// written changes meaning, so a reconstructed world can be recognized as older and upgraded.
export const Physics3DWorldVersion = 1;

// Recomputes the inverse mass and local inverse inertia after something that changes a body's
// ELIGIBILITY to move rather than its geometry — a type change, a fixed-rotation change.
//
// It reads the forward mass and inertia the body already carries, which is exactly why those are
// stored: the inverse is zero for every body this is called on the way out of, so it holds nothing to
// recover them from.
function refreshRigidBody3DMass(body: RigidBody3D): void {
  scratchMassData.mass = body.mass;
  scratchMassData.centerX = body.centerX;
  scratchMassData.centerY = body.centerY;
  scratchMassData.centerZ = body.centerZ;
  scratchMassData.inertiaXX = body.inertiaXX;
  scratchMassData.inertiaYY = body.inertiaYY;
  scratchMassData.inertiaZZ = body.inertiaZZ;
  scratchMassData.inertiaXY = body.inertiaXY;
  scratchMassData.inertiaXZ = body.inertiaXZ;
  scratchMassData.inertiaYZ = body.inertiaYZ;

  setRigidBody3DMassData(body, scratchMassData);
}

const scratchCenter = [0, 0, 0];
const scratchMassData = createPhysics3DMassData();
