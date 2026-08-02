import type {
  Physics2DJoint,
  Physics2DJointKind,
  Physics2DJointSolver,
  Physics2DWorld,
} from '@flighthq/types/contract';

import { wakePhysics2DBody } from './islands';
import { physics2DJointOwners } from './ownership';
import { findPhysics2DBody, isPhysics2DPairOrdered } from './world';

// Adds `joint` to `world` under the same canonical body ordering contacts use, swapping its two ends when
// the caller supplied them the other way round.
//
// A joint is a constraint in the SAME sequential solve list as a contact, so it inherits the same
// obligation: each impulse lands on the velocities the previous one left, and an ordering that varied
// with construction history would make the result vary with it. Contacts get this from the broadphase
// pair sort; joints have no broadphase, so it is enforced here, at the one place a joint enters the
// world. The anchors and lever arms swap with the bodies — a joint whose ends were exchanged without its
// anchors would attach to the wrong points and hold the pair in a pose nobody asked for.
export function addPhysics2DJoint(world: Physics2DWorld, joint: Physics2DJoint): Physics2DJoint {
  if (physics2DJointOwners.has(joint) || world.joints.includes(joint)) {
    throw new Error('Cannot add a physics joint that already belongs to a physics world');
  }
  // The kind decides how to reverse itself, because the registry cannot know which of a joint's fields
  // carry a direction — see _canonicalizePhysics2DJointEnds.
  // Only canonicalize when the kind can be consulted. A joint whose solver is not registered yet is
  // explicitly supported (a scene deserialized ahead of the code that solves it), and swapping it now
  // would exchange the bodies and anchors while its kind-specific direction fields stayed as authored --
  // the generic half of a swap with the kind's half missing, which no later registration would repair.
  // An unregistered joint constrains nothing, so its ordering does not matter until a solver exists;
  // registerPhysics2DJointSolver canonicalizes what is already in the world at that point.
  const active = getPhysics2DJointSolver(world, joint.kind) !== null;
  if (active) _canonicalizePhysics2DJointEnds(world, joint);
  world.joints.push(joint);
  physics2DJointOwners.set(joint, world);
  // Adding an active constraint changes what both bodies may do THIS step. A sleeping pair would skip
  // prepare and solve forever unless something unrelated happened to wake it. Unknown kinds remain
  // inert until registration, and are woken on that activation path instead.
  if (active) _wakePhysics2DJointBodies(world, joint);
  return joint;
}

// Exchanges `joint`'s ends when the pair is out of canonical order and the kind consents. The kind is
// asked only when a swap is actually pending, since swapEnds both vetoes and transforms: calling it
// otherwise would apply a reversal to ends that never moved.
function _canonicalizePhysics2DJointEnds(world: Physics2DWorld, joint: Physics2DJoint): void {
  const solver = getPhysics2DJointSolver(world, joint.kind);
  if (solver?.usesBodyA === false) return;
  const first = findPhysics2DBody(world, joint.bodyA);
  const second = findPhysics2DBody(world, joint.bodyB);
  if (first === null || second === null || isPhysics2DPairOrdered(first, second)) return;
  if (!(solver?.swapEnds?.(joint) ?? true)) return;
  const bodyA = joint.bodyA;
  joint.bodyA = joint.bodyB;
  joint.bodyB = bodyA;
  const anchorX = joint.localAnchorAX;
  const anchorY = joint.localAnchorAY;
  joint.localAnchorAX = joint.localAnchorBX;
  joint.localAnchorAY = joint.localAnchorBY;
  joint.localAnchorBX = anchorX;
  joint.localAnchorBY = anchorY;
}

// The solver registered for `kind`, or null when none is. A missing solver is an expected condition, not
// an error: a scene deserialized with a joint kind the running build does not know about should import
// and simply not constrain, rather than refuse to load.
export function getPhysics2DJointSolver(
  world: Readonly<Physics2DWorld>,
  kind: Physics2DJointKind,
): Physics2DJointSolver | null {
  return world.jointSolvers.get(kind) ?? null;
}

// Registers `solver` for `kind` on this world. Last write wins, so a caller may replace a built-in with
// its own — collisions are avoided by the vendor-prefix convention (bare names reserved for built-ins),
// not by a guard that would make overriding impossible.
//
// Registration is per-world and explicit rather than a module-level table populated on import, so a
// bundle that never registers a joint never links one: nine solvers are nine chunks of constraint math,
// and a game using none of them should pay for none of them.
export function registerPhysics2DJointSolver(
  world: Physics2DWorld,
  kind: Physics2DJointKind,
  solver: Physics2DJointSolver,
): void {
  world.jointSolvers.set(kind, solver);
  // Joints of this kind may already be in the world: addPhysics2DJoint deliberately leaves an
  // unknown-kind joint in its authored order, because canonicalizing it without the kind's consent
  // would half-swap it. This is where that deferred work happens, so the outcome no longer depends on
  // whether the scene or the solver arrived first.
  for (const joint of world.joints) {
    if (joint.kind !== kind) continue;
    _canonicalizePhysics2DJointEnds(world, joint);
    // Registration turns a previously inert descriptor into a live constraint. Re-registration may
    // replace its equation entirely, so it is the same topology change from the sleepers' perspective.
    _wakePhysics2DJointBodies(world, joint);
  }
}

// Removes `joint` from `world`. Returns false when the world does not hold it.
export function removePhysics2DJoint(world: Physics2DWorld, joint: Readonly<Physics2DJoint>): boolean {
  const at = world.joints.indexOf(joint as Physics2DJoint);
  if (at < 0) return false;
  if (getPhysics2DJointSolver(world, joint.kind) !== null) _wakePhysics2DJointBodies(world, joint);
  world.joints.splice(at, 1);
  physics2DJointOwners.delete(joint as Physics2DJoint);
  return true;
}

function _wakePhysics2DJointBodies(world: Readonly<Physics2DWorld>, joint: Readonly<Physics2DJoint>): void {
  const solver = getPhysics2DJointSolver(world, joint.kind);
  if (solver === null) return;
  const bodyA = solver.usesBodyA === false ? null : findPhysics2DBody(world, joint.bodyA);
  const bodyB = findPhysics2DBody(world, joint.bodyB);
  if (bodyA !== null) wakePhysics2DBody(bodyA);
  if (bodyB !== null) wakePhysics2DBody(bodyB);
}
