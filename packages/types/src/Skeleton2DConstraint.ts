import type { Entity } from './Entity';
import type { Skeleton2D } from './Skeleton2D';

/**
 * A pose rule applied after the bones are placed and before they are drawn — inverse kinematics, transform
 * copying, and later path following. Constraints are plain data carrying a `kind`, and a solver is
 * registered against that kind, so a rig that uses only IK never bundles the others.
 *
 * `mix` is the blend from the unconstrained pose to the solved one: 0 leaves the bone exactly as animation
 * posed it, 1 applies the constraint fully. It is the field that lets a constraint be faded in and out by
 * an animation rather than being all-or-nothing, which is how both Spine and DragonBones author them.
 */
export interface Skeleton2DConstraint extends Entity {
  kind: Skeleton2DConstraintKind;
  mix: number;
}

/**
 * What solves a constraint. `solveSkeleton2DConstraints` looks the kind up and hands the whole constraint
 * over, so a family this package does not own solves in the same pass as the built-in ones.
 *
 * A solver READS `skeleton.worldMatrices` (the caller must have filled them) and WRITES bone LOCAL
 * transforms, then refreshes the world matrices of the bones it moved so a later constraint in the same
 * pass sees them. It does not propagate to descendants — the caller re-runs
 * `computeSkeleton2DWorldTransforms` once after the whole pass, which is one walk rather than one per
 * constraint.
 */
export type Skeleton2DConstraintSolver = (skeleton: Skeleton2D, constraint: Readonly<Skeleton2DConstraint>) => void;

/**
 * The registry key for a constraint family, on the same terms as every other `*Kind` in the SDK: a plain
 * string, PascalCase, vendor-prefixed when it is not Flight's own.
 */
export const Skeleton2DConstraintKind = {
  Ik: 'Skeleton2D.IkConstraint',
  Path: 'Skeleton2D.PathConstraint',
  Transform: 'Skeleton2D.TransformConstraint',
} as const;

export type Skeleton2DConstraintKind = string;
