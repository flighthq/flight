import type {
  Physics2DJoint,
  Physics2DJointKind,
  Physics2DJointSolver,
  Physics2DWorld,
} from '@flighthq/types/contract';

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
  const first = findPhysics2DBody(world, joint.bodyA);
  const second = findPhysics2DBody(world, joint.bodyB);
  if (first !== null && second !== null && !isPhysics2DPairOrdered(first, second)) {
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
  world.joints.push(joint);
  return joint;
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
}

// Removes `joint` from `world`. Returns false when the world does not hold it.
export function removePhysics2DJoint(world: Physics2DWorld, joint: Readonly<Physics2DJoint>): boolean {
  const at = world.joints.indexOf(joint as Physics2DJoint);
  if (at < 0) return false;
  world.joints.splice(at, 1);
  return true;
}
