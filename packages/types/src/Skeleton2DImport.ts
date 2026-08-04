import type { AnimationClip } from './AnimationClip';
import type { Skeleton2D } from './Skeleton2D';
import type { Skeleton2DDrawOrderTimeline } from './Skeleton2DDrawOrderTimeline';

// The result of importing a 2D skeletal rig file (Spine / DragonBones): the setup-pose `Skeleton2D` plus
// its named animations. Each animation is an `@flighthq/animation` `AnimationClip` whose channels carry
// `Skeleton2DAnimationTarget` refs addressing this skeleton's bones by index and hold RELATIVE deltas —
// `applyAnimationClipToSkeleton2D` composes them onto this setup skeleton, writing the pose into a
// `cloneSkeleton2D` of it. An empty `animations` is a setup-pose-only import (the rig had no timelines, or
// animation was Skip-crumbed).
export interface Skeleton2DImport {
  animations: readonly Skeleton2DImportAnimation[];
  skeleton: Skeleton2D;
}

// One named animation from an imported rig — the `name` the source file gave the clip (e.g. Spine's
// "walk"), paired with the built `AnimationClip`.
//
// `drawOrder` travels beside the clip rather than inside it because a draw-order channel's target names
// display nodes and a `NodeOrderList`, none of which exist at parse time. `createSkeleton2DDrawOrderChannel`
// builds that channel once there are nodes to name. Null or absent when the animation reorders nothing,
// which is most of them.
//
// Optional rather than required only because the parsers do not emit it yet; it becomes required once they
// do, so a parser that forgets it is a type error rather than a silently orderless import.
export interface Skeleton2DImportAnimation {
  clip: AnimationClip;
  drawOrder?: Skeleton2DDrawOrderTimeline | null;
  name: string;
}
