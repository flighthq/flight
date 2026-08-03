import type { Physics2DWorld } from '@flighthq/types/contract';

// Constant-time broadphase lookup for whether any active joint suppresses this body pair.
export function isPhysics2DPairJointSuppressed(world: Readonly<Physics2DWorld>, bodyA: number, bodyB: number): boolean {
  const first = Math.min(bodyA, bodyB);
  const second = Math.max(bodyA, bodyB);
  return (world.jointCollisionSuppressions.get(first)?.get(second) ?? 0) > 0;
}

// Rebuilds the authored-joint suppression index at lifecycle/invalidation boundaries. This work is
// intentionally O(joints) there so broadphase pair filtering is O(1) per candidate during every step.
// Rebuilding also makes explicit invalidation sufficient after callers edit endpoints or
// collideConnected directly: the index never needs hidden per-joint shadow state.
export function rebuildPhysics2DJointCollisionSuppressions(world: Physics2DWorld): void {
  const suppressions = world.jointCollisionSuppressions;
  suppressions.clear();
  for (const joint of world.joints) {
    if (joint.collideConnected) continue;
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
