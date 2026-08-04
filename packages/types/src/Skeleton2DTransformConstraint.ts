import type { Skeleton2DConstraint } from './Skeleton2DConstraint';

/**
 * Copies a target bone's world transform onto other bones, channel by channel — the constraint behind a
 * head that stays level however the neck turns, or a pair of wheels that share one rotation.
 *
 * Each channel has its OWN mix rather than sharing the constraint's, because copying only rotation while
 * leaving position alone is the common case rather than the exception; the base `mix` scales all of them,
 * so an animation can fade the whole constraint with one channel. A channel at 0 leaves that part of the
 * bone exactly as animation posed it.
 *
 * The offsets are added to the copied value before mixing, in the target's own terms: `offsetRotation` and
 * `offsetShearY` are degrees, `offsetX`/`offsetY` are the target's local units, and the scale offsets are
 * added to the copied scale rather than multiplied into it (so 0 means "no change", matching how both
 * formats author them).
 *
 * This is the WORLD-space form: the target's world transform is what gets copied. Spine's `local` and
 * `relative` variants — copying local transforms, or adding rather than replacing — are a named deferral
 * rather than a silent omission, and a constraint carrying no field for them cannot claim to honor them.
 */
export interface Skeleton2DTransformConstraint extends Skeleton2DConstraint {
  boneIndices: readonly number[];
  kind: 'Skeleton2D.TransformConstraint';
  mixRotate: number;
  mixScaleX: number;
  mixScaleY: number;
  mixShearY: number;
  mixX: number;
  mixY: number;
  offsetRotation: number;
  offsetScaleX: number;
  offsetScaleY: number;
  offsetShearY: number;
  offsetX: number;
  offsetY: number;
  targetBoneIndex: number;
}
