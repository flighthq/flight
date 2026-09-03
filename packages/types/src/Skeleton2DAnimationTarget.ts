import type { Entity } from './Entity';
import type { Skeleton2DAnimationPath } from './Skeleton2DAnimationPath';
import type { Skeleton2DAnimationTargetKind } from './Skeleton2DAnimationTargetKind';

// The binding target an AnimationChannel carries when it drives a Skeleton2D bone: which bone (by index
// into the skeleton's flat bone array) and which transform group (`path`). The 2D-skeletal analogue of
// Scene3DAnimationTarget (which is `{ node, path }` over a Node3D's TRS). Stored as the channel's opaque
// `targetRef`; a binder — `applyAnimationClipToSkeleton2D` in @flighthq/skeleton2d, mirroring
// `applyAnimationClipToScene3D` — casts `targetRef` to this, samples the channel's track (a RELATIVE
// delta), composes it onto the setup bone (add for translate/rotate/shear, multiply for scale) and writes
// the result to the matching pose `Bone2D` field(s), then re-propagates world transforms. `boneIndex` (not
// a `Bone2D` reference) keeps the target stable across a `cloneSkeleton2D` — the same clip drives a cloned rig.
export interface Skeleton2DAnimationTarget extends Entity {
  boneIndex: number;
  kind: Skeleton2DAnimationTargetKind;
  path: Skeleton2DAnimationPath;
}
