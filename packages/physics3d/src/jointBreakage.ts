import type { Physics3DJoint, Physics3DWorld } from '@flighthq/types/contract';

import {
  createPhysics3DJointReaction,
  getPhysics3DJointReactionForce,
  getPhysics3DJointReactionTorque,
  writePhysics3DJointReaction,
} from './jointReaction';

// Breaking a joint under load. A rope that parts, a hinge torn off its frame, a weld that fails.
//
// Read from the same reaction a caller can query, rather than from a private measurement, so the number
// a threshold fires on is the number the caller can inspect BEFORE it fires. A break that could not have
// been predicted from the public API would be untunable.

// Marks a joint broken and records it, whatever its load. The manual door into the same state the
// threshold produces, for a caller cutting a rope on cue rather than by force.
//
// Idempotent, because the event list is a record of TRANSITIONS: breaking an already-broken joint a
// second time would report a second break that never happened.
export function breakPhysics3DJoint(world: Physics3DWorld, joint: Physics3DJoint): void {
  if (joint.broken) return;
  joint.broken = true;
  world.jointEvents.broke.push(joint);
}

// Tests every joint's load against its own thresholds and breaks those that exceed either.
//
// Runs where the impulses are FINAL — after the velocity iterations of the sub-interval that produced
// them, and before the next sub-interval overwrites them. Testing earlier reads a partly converged
// accumulator and breaks joints that would have held, which presents as thresholds that drift with the
// solver's iteration count rather than with the load.
export function evaluatePhysics3DJointBreakage(world: Physics3DWorld, dt: number): void {
  for (const joint of world.joints) {
    if (joint.broken) continue;
    if (!isPhysics3DJointBreakable(joint)) continue;
    if (!writePhysics3DJointReaction(world, joint, dt, breakageReaction)) continue;
    if (
      getPhysics3DJointReactionForce(breakageReaction) > joint.breakForce ||
      getPhysics3DJointReactionTorque(breakageReaction) > joint.breakTorque
    ) {
      breakPhysics3DJoint(world, joint);
    }
  }
}

// Whether a joint could break at all. Checked before the reaction is measured, because the overwhelming
// majority of joints are unbreakable and a reaction is real arithmetic per joint per sub-interval.
export function isPhysics3DJointBreakable(joint: Readonly<Physics3DJoint>): boolean {
  return Number.isFinite(joint.breakForce) || Number.isFinite(joint.breakTorque);
}

const breakageReaction = createPhysics3DJointReaction();
