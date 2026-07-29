import type { AnimationClip } from './AnimationClip';
import type { Skeleton2D } from './Skeleton2D';

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
export interface Skeleton2DImportAnimation {
  clip: AnimationClip;
  name: string;
}
