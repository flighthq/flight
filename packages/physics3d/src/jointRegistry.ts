import type {
  Physics3DJoint,
  Physics3DJointKind,
  Physics3DJointSolver,
  Physics3DWorld,
} from '@flighthq/types/contract';

import { rebuildPhysics3DJointCollisionSuppressions } from './jointCollisionSuppression';
import { assertPhysics3DWorldNotStepping, physics3DJointOwners } from './ownership';
import { findPhysics3DBody, wakePhysics3DBody } from './world';

// Adds `joint` to `world` under the same canonical body ordering contacts use, exchanging its two ends when
// the caller supplied them the other way round.
//
// A joint is a constraint in the SAME sequential solve list as a contact, so it inherits the same
// obligation: each impulse lands on the velocities the previous one left, and an ordering that varied with
// construction history would make the result vary with it. Contacts get their order from the broadphase pair
// sort; joints have no broadphase, so it is enforced here, at the one place a joint enters a world.
export function addPhysics3DJoint<T extends Physics3DJoint>(world: Physics3DWorld, joint: T): T {
  assertPhysics3DWorldNotStepping(world);
  if (physics3DJointOwners.has(joint) || world.joints.includes(joint)) {
    throw new Error('Cannot add a physics joint that already belongs to a physics world');
  }

  // Canonicalize only when the kind can be consulted. A joint whose solver is not registered yet is
  // explicitly supported — a scene deserialized ahead of the code that solves it — and exchanging its ends
  // now would move the bodies, anchors, and frames while the kind's own direction-bearing fields stayed as
  // authored: the generic half of a swap with the kind's half missing, which no later registration repairs.
  // An unregistered joint constrains nothing, so its order does not matter until a solver exists, and
  // `registerPhysics3DJointSolver` canonicalizes what is already in the world at that point.
  const active = getPhysics3DJointSolver(world, joint.kind) !== null;
  if (active) canonicalizeJointEnds(world, joint);
  world.joints.push(joint);
  physics3DJointOwners.set(joint, world);
  rebuildPhysics3DJointCollisionSuppressions(world);
  // Adding an active constraint changes what both bodies may do THIS step. A sleeping pair would skip
  // prepare and solve forever unless something unrelated happened to wake it.
  if (active) wakeJointBodies(world, joint);
  return joint;
}

// The solver registered for `kind` on this world, or null when none is. A missing solver is an expected
// condition rather than an error: a scene deserialized with a joint kind the running build does not know
// about should import and simply not constrain, rather than refuse to load.
export function getPhysics3DJointSolver(
  world: Readonly<Physics3DWorld>,
  kind: Physics3DJointKind,
): Physics3DJointSolver | null {
  return world.jointSolvers.get(kind) ?? null;
}

// Discards solver-owned state after a stored joint's authored parameters change. Returns false when the
// world does not hold the joint.
//
// A cached impulse is an answer to the PREVIOUS constraint equation. Reapplying it after an anchor, frame,
// limit, or motor changes kicks both bodies before the new equation gets its first iteration — which reads
// as a joint that lurches when it is edited rather than as a stale cache. The kind clears whatever
// accumulators only it knows about; the common `impulse0..5` block is cleared here.
export function invalidatePhysics3DJoint(world: Physics3DWorld, joint: Physics3DJoint): boolean {
  assertPhysics3DWorldNotStepping(world);
  if (physics3DJointOwners.get(joint) !== world || !world.joints.includes(joint)) return false;
  getPhysics3DJointSolver(world, joint.kind)?.clearAccumulatedImpulses?.(joint);
  joint.impulse0 = 0;
  joint.impulse1 = 0;
  joint.impulse2 = 0;
  joint.impulse3 = 0;
  joint.impulse4 = 0;
  joint.impulse5 = 0;
  rebuildPhysics3DJointCollisionSuppressions(world);
  wakeJointBodies(world, joint);
  return true;
}

// Whether the two bodies are in canonical order — `bodyA` before `bodyB` by persistent index.
//
// Ordered by INDEX rather than by anything geometric. Any order derived from coordinates flips the moment
// those coordinates cross, which would renumber a joint's ends mid-simulation and invalidate every
// accumulator keyed to them. Identity survives motion; position does not.
export function isPhysics3DPairOrdered(a: number, b: number): boolean {
  return a <= b;
}

// Registers `solver` for `kind` on this world. Last write wins, so a caller may replace a built-in with its
// own — collisions are avoided by the vendor-prefix convention (bare names reserved for built-ins) rather
// than by a guard that would make overriding impossible.
//
// Registration is per-world and explicit rather than a module-level table populated on import, so a bundle
// that never registers a joint never links one: six solvers are six blocks of constraint math, and a game
// using none of them should pay for none of them.
export function registerPhysics3DJointSolver(
  world: Physics3DWorld,
  kind: Physics3DJointKind,
  solver: Physics3DJointSolver,
): void {
  assertPhysics3DWorldNotStepping(world);
  world.jointSolvers.set(kind, solver);
  // Joints of this kind may already be in the world: `addPhysics3DJoint` deliberately leaves an
  // unknown-kind joint in its authored order. This is where that deferred work happens, so the outcome no
  // longer depends on whether the scene or the solver arrived first.
  for (const joint of world.joints) {
    if (joint.kind !== kind) continue;
    canonicalizeJointEnds(world, joint);
    // Registration turns an inert descriptor into a live constraint, and re-registration may replace its
    // equation outright. Both are the same topology change from a sleeping neighbour's point of view.
    wakeJointBodies(world, joint);
  }
  rebuildPhysics3DJointCollisionSuppressions(world);
}

// Removes `joint` from `world`. Returns false when the world does not hold it.
export function removePhysics3DJoint(world: Physics3DWorld, joint: Physics3DJoint): boolean {
  assertPhysics3DWorldNotStepping(world);
  const at = world.joints.indexOf(joint);
  if (at < 0) return false;
  if (getPhysics3DJointSolver(world, joint.kind) !== null) wakeJointBodies(world, joint);
  world.joints.splice(at, 1);
  physics3DJointOwners.delete(joint);
  rebuildPhysics3DJointCollisionSuppressions(world);
  return true;
}

// Exchanges `joint`'s ends when the pair is out of canonical order and the kind consents.
//
// The kind is asked only when a swap is actually pending, because `swapEnds` both vetoes AND transforms:
// calling it otherwise would apply a reversal to ends that never moved. What the generic half can move is
// only what every joint has — two body indices and two anchors. Anything a kind measures FROM bodyA TO
// bodyB, including its frames, reverses with them and is the kind's own to carry across.
function canonicalizeJointEnds(world: Readonly<Physics3DWorld>, joint: Physics3DJoint): void {
  const solver = getPhysics3DJointSolver(world, joint.kind);
  if (solver?.usesBodyA === false) return;
  if (isPhysics3DPairOrdered(joint.bodyA, joint.bodyB)) return;
  if (!(solver?.swapEnds?.(joint) ?? true)) return;

  const bodyA = joint.bodyA;
  joint.bodyA = joint.bodyB;
  joint.bodyB = bodyA;

  const anchorX = joint.localAnchorAX;
  const anchorY = joint.localAnchorAY;
  const anchorZ = joint.localAnchorAZ;
  joint.localAnchorAX = joint.localAnchorBX;
  joint.localAnchorAY = joint.localAnchorBY;
  joint.localAnchorAZ = joint.localAnchorBZ;
  joint.localAnchorBX = anchorX;
  joint.localAnchorBY = anchorY;
  joint.localAnchorBZ = anchorZ;
}

function wakeJointBodies(world: Readonly<Physics3DWorld>, joint: Readonly<Physics3DJoint>): void {
  const solver = getPhysics3DJointSolver(world, joint.kind);
  if (solver === null) return;
  const bodyA = solver.usesBodyA === false ? null : findPhysics3DBody(world, joint.bodyA);
  const bodyB = findPhysics3DBody(world, joint.bodyB);
  if (bodyA !== null) wakePhysics3DBody(bodyA);
  if (bodyB !== null) wakePhysics3DBody(bodyB);
}
