import type { Physics3DJoint, Physics3DJointReaction, Physics3DWorld } from '@flighthq/types/contract';

// What a joint is CARRYING — the force and torque its constraint applied over the sub-interval just
// solved. A stress readout, a break threshold, a gameplay trigger for a rope about to snap.
//
// The reading is per SUB-INTERVAL, not per step. A world running substeps solves several sub-intervals
// per step and each converges its own impulses, so this reports the most recent one. That is the right
// grain for a threshold — a joint that momentarily carried ten times its average load did carry it — and
// the wrong grain for an average, which a caller wanting one should accumulate itself.

// Adds one constraint row's contribution to a reaction.
//
// The torque term is `armB - rB x direction`, and the subtraction is what makes force and torque
// INDEPENDENT readings. A row's angular arm already contains `rB x direction` for a linear row, which is
// the torque that row exerts about the centre of mass purely by acting at an offset anchor. Leaving it in
// would make a weight hung off a joint register as twist, and a `breakTorque` fire on hanging load. The
// subtraction cancels it exactly for a linear row and leaves a purely angular row untouched.
export function accumulatePhysics3DJointRowReaction(
  joint: Readonly<Physics3DJoint>,
  state: readonly number[],
  offset: number,
  impulse: number,
  out: Physics3DJointReaction,
): void {
  if (impulse === 0) return;
  const directionX = state[offset];
  const directionY = state[offset + 1];
  const directionZ = state[offset + 2];
  out.forceX += directionX * impulse;
  out.forceY += directionY * impulse;
  out.forceZ += directionZ * impulse;

  const leverX = joint.rBY * directionZ - joint.rBZ * directionY;
  const leverY = joint.rBZ * directionX - joint.rBX * directionZ;
  const leverZ = joint.rBX * directionY - joint.rBY * directionX;
  out.torqueX += (state[offset + 6] - leverX) * impulse;
  out.torqueY += (state[offset + 7] - leverY) * impulse;
  out.torqueZ += (state[offset + 8] - leverZ) * impulse;
}

export function clearPhysics3DJointReaction(out: Physics3DJointReaction): void {
  out.forceX = 0;
  out.forceY = 0;
  out.forceZ = 0;
  out.torqueX = 0;
  out.torqueY = 0;
  out.torqueZ = 0;
}

export function createPhysics3DJointReaction(): Physics3DJointReaction {
  return { forceX: 0, forceY: 0, forceZ: 0, torqueX: 0, torqueY: 0, torqueZ: 0 };
}

export function getPhysics3DJointReactionForce(reaction: Readonly<Physics3DJointReaction>): number {
  return Math.sqrt(
    reaction.forceX * reaction.forceX + reaction.forceY * reaction.forceY + reaction.forceZ * reaction.forceZ,
  );
}

export function getPhysics3DJointReactionTorque(reaction: Readonly<Physics3DJointReaction>): number {
  return Math.sqrt(
    reaction.torqueX * reaction.torqueX + reaction.torqueY * reaction.torqueY + reaction.torqueZ * reaction.torqueZ,
  );
}

// Writes the load `joint` carried over the most recent sub-interval, and returns whether there was one to
// read. False leaves the reaction zeroed, and means one of: the kind has no registered solver, the kind
// does not report a reaction, the joint has not been solved since it was added, or `dt` was not positive.
//
// `dt` is the SUB-INTERVAL the world solved, which is `dt / substeps` for a stepped world — not the frame
// time. Passing the frame time understates the force by the substep count. It is a parameter rather than
// something read back off the world because the world does not retain it, and a remembered timestep is a
// second source of truth that goes stale the first time a caller varies its step.
export function writePhysics3DJointReaction(
  world: Readonly<Physics3DWorld>,
  joint: Readonly<Physics3DJoint>,
  dt: number,
  out: Physics3DJointReaction,
): boolean {
  clearPhysics3DJointReaction(out);
  if (!(dt > 0)) return false;
  const solver = world.jointSolvers.get(joint.kind);
  if (solver?.writeReaction === undefined) return false;
  return solver.writeReaction(joint, 1 / dt, out);
}
