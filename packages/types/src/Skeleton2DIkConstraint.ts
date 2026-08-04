import type { Skeleton2DConstraint } from './Skeleton2DConstraint';

/**
 * Inverse kinematics over a one- or two-bone chain: rotate the chain so its tip reaches a target bone's
 * world position, instead of animating each joint angle by hand.
 *
 * `boneIndices` is the chain in parent-to-child order — one bone (aim) or two (elbow/knee). Longer chains
 * are a named deferral, not an oversight: both formats this models author one and two, and an N-bone
 * solver is a different algorithm (iterative) rather than more of this one.
 *
 * `bendPositive` picks which of the two solutions a two-bone chain uses — the elbow that bends up or the
 * one that bends down. It has no effect on a one-bone chain, which has a single solution.
 *
 * `stretch` lets a chain that cannot reach lengthen along its own axis instead of falling short, and
 * `compress` lets a one-bone chain shorten when the target is nearer than its length. Both are scaled by
 * `mix`, so a faded constraint stretches proportionally rather than snapping.
 *
 * Spine's `softness` (easing the last stretch of reach so a limb does not snap straight) is deliberately
 * NOT a field here: carrying a field the solver does not honor is worse than not carrying it, so it is
 * named as deferred rather than accepted and silently dropped.
 */
export interface Skeleton2DIkConstraint extends Skeleton2DConstraint {
  bendPositive: boolean;
  boneIndices: readonly number[];
  compress: boolean;
  kind: 'Skeleton2D.IkConstraint';
  stretch: boolean;
  targetBoneIndex: number;
}
