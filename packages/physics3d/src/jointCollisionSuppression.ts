import type { Physics3DWorld } from '@flighthq/types/contract';

// Constant-time lookup for whether any active joint suppresses collision between a body pair. A broadphase
// asks this once per candidate pair, so it has to be a lookup rather than a scan of the joint list.
export function isPhysics3DPairJointSuppressed(world: Readonly<Physics3DWorld>, bodyA: number, bodyB: number): boolean {
  const first = Math.min(bodyA, bodyB);
  const second = Math.max(bodyA, bodyB);
  return (world.jointCollisionSuppressions.get(first)?.get(second) ?? 0) > 0;
}

// Rebuilds the suppression index from the joint list. Called at every lifecycle and invalidation boundary,
// where the work is O(joints) once, rather than during the step, where the question is asked O(pairs) times.
//
// Rebuilding wholesale is also what makes explicit invalidation sufficient after a caller edits a joint's
// endpoints or `collideConnected` in place: there is no per-joint shadow state that could still describe the
// pair the joint used to connect.
//
// The nested value is a REFERENCE COUNT, not a flag. Two joints may connect the same pair — a hinge plus a
// motor-bearing slider on the same hinge line — and removing one of them must not re-enable a collision the
// other still suppresses.
export function rebuildPhysics3DJointCollisionSuppressions(world: Physics3DWorld): void {
  const suppressions = world.jointCollisionSuppressions;
  suppressions.clear();
  for (const joint of world.joints) {
    if (joint.collideConnected) continue;
    // A joint whose kind has no registered solver constrains nothing, and a one-body kind never reads
    // bodyA — in both cases the pair is not actually held together, so suppressing its collision would hide
    // a contact for no reason.
    const solver = world.jointSolvers.get(joint.kind);
    if (solver === undefined || solver.usesBodyA === false) continue;
    const first = Math.min(joint.bodyA, joint.bodyB);
    const second = Math.max(joint.bodyA, joint.bodyB);
    let seconds = suppressions.get(first);
    if (seconds === undefined) {
      seconds = new Map();
      suppressions.set(first, seconds);
    }
    seconds.set(second, (seconds.get(second) ?? 0) + 1);
  }
}
