import type { Skeleton2DAnimationPath } from './Skeleton2DAnimationPath';

// The binding target an AnimationChannel carries when it drives a Skeleton2D bone: which bone (by index
// into the skeleton's flat bone array) and which transform group (`path`). The 2D-skeletal analogue of
// Scene3DAnimationTarget (which is `{ node, path }` over a Node3D's TRS). Stored as the channel's opaque
// `targetRef`; a binder — `applyAnimationClipToSkeleton2D` in @flighthq/skeleton2d, mirroring
// `applyAnimationClipToScene3D` — casts `targetRef` to this, samples the channel's track, writes the value
// into the matching `Bone2D` field(s), then re-propagates world transforms. `boneIndex` (not a `Bone2D`
// reference) keeps the target stable across a `cloneSkeleton2D` — the same clip drives a cloned rig.
export interface Skeleton2DAnimationTarget {
  boneIndex: number;
  path: Skeleton2DAnimationPath;
}
