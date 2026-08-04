import type { Skeleton2DConstraint } from './Skeleton2DConstraint';

/**
 * Positions a chain of bones ALONG a vector path — a caterpillar track, a rope, a row of carriages
 * following rails. The path is the attachment on a target slot, so the same `PathAttachment2D` that can
 * be skinned by bones can also drive them.
 *
 * `position` is where along the path the first bone sits and `spacing` is the gap between successive
 * bones; each is read in the units its mode names, which is why the modes exist rather than a single
 * "distance" convention that would be wrong for half the rigs that use it.
 *
 * `rotateMode` decides what a bone's rotation follows: `Tangent` aims every bone along the path's own
 * direction at its position, which is what a rope does; `Chain` aims each bone at the NEXT bone's
 * position, which is what a linkage does and which keeps the chain rigid where the path is coarse.
 *
 * The three mixes are separate for the same reason the transform constraint's are: following a path's
 * position while keeping authored rotation is a real authoring choice, not a degenerate case.
 */
export interface Skeleton2DPathConstraint extends Skeleton2DConstraint {
  boneIndices: readonly number[];
  kind: 'Skeleton2D.PathConstraint';
  mixRotate: number;
  mixX: number;
  mixY: number;
  /** Arc-length units when `Fixed`, a 0..1 fraction of the whole path when `Percent`. */
  position: number;
  positionMode: Skeleton2DPathPositionMode;
  rotateMode: Skeleton2DPathRotateMode;
  /**
   * Arc-length units when `Fixed`, a 0..1 fraction of the path when `Percent`, and a multiple of each
   * bone's own `length` when `Length` — the mode that keeps a chain of unequal bones evenly jointed.
   */
  spacing: number;
  spacingMode: Skeleton2DPathSpacingMode;
  /** The slot whose attachment is the `PathAttachment2D` to follow. */
  targetSlotIndex: number;
}

export const Skeleton2DPathPositionMode = {
  Fixed: 'Fixed',
  Percent: 'Percent',
} as const;

export type Skeleton2DPathPositionMode = (typeof Skeleton2DPathPositionMode)[keyof typeof Skeleton2DPathPositionMode];

export const Skeleton2DPathRotateMode = {
  Chain: 'Chain',
  Tangent: 'Tangent',
} as const;

export type Skeleton2DPathRotateMode = (typeof Skeleton2DPathRotateMode)[keyof typeof Skeleton2DPathRotateMode];

export const Skeleton2DPathSpacingMode = {
  Fixed: 'Fixed',
  Length: 'Length',
  Percent: 'Percent',
} as const;

export type Skeleton2DPathSpacingMode = (typeof Skeleton2DPathSpacingMode)[keyof typeof Skeleton2DPathSpacingMode];
