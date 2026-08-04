import type { AnimationClip, Skeleton2D, Skeleton2DAnimationTarget } from '@flighthq/types/contract';

import { getSkeleton2DAnimationTargetBinder } from './skeleton2dAnimationTarget';

// Poses `pose` from an AnimationClip at `time` by COMPOSING each channel's sampled value onto the
// corresponding `setup` bone — the 2D-skeletal analogue of @flighthq/scene3d's `applyAnimationClipToScene3D`,
// but relative rather than absolute. This mirrors Spine's SkeletonData(setup)/Skeleton(instance) split:
// `setup` is the immutable rest pose, `pose` is the animated instance (typically a `cloneSkeleton2D(setup)`),
// and a clip carries RELATIVE deltas — translate/rotate/shear ADD to setup, scale MULTIPLIES it (Spine's
// timeline semantics; the `path` distinguishes which). Composing from `setup` every call (not from `pose`)
// is what makes clips blendable — a mixer accumulates deltas as `pose = setup + Σ wᵢ·deltaᵢ`, which averaging
// baked-absolute poses cannot express — and is why re-applying a clip does not accumulate across frames.
//
// One clip carries channels for several families at once — bone transforms, slot appearance, and whatever
// else has registered a binder — so this walks the channels ONCE and hands each to the binder its target
// kind names. Not every family follows the compose rule: a slot colour is an ABSOLUTE authored value that
// its binder writes without reading `setup` at all.
//
// It writes only what a channel targets; untouched pose bones keep their clone-of-setup values. The caller
// runs `computeSkeleton2DWorldTransforms(pose, …)` (then the deform) afterward, so a whole clip applies
// before one world propagation. A channel whose target is foreign, unregistered, or out of range is
// skipped (sentinel guard, no throw).
//
// This is the documented exception to the out-param aliasing rule: `setup` is read across the whole pass
// while `pose` is written, so they cannot be the same object. Passing one skeleton as both would clobber
// the rest pose the binder composes against and then accumulate against garbage every subsequent frame —
// a silent, delayed corruption — so it is a programmer error the guard below throws on, not a sentinel.
export function applyAnimationClipToSkeleton2D(
  clip: Readonly<AnimationClip>,
  setup: Readonly<Skeleton2D>,
  pose: Skeleton2D,
  time: number,
): void {
  if (setup === pose) {
    throw new Error(
      'applyAnimationClipToSkeleton2D: setup and pose must be distinct skeletons — pass a cloneSkeleton2D(setup) as pose',
    );
  }
  const channels = clip.channels;
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const target = channel.targetRef as Skeleton2DAnimationTarget | null;
    if (target === null || typeof target !== 'object') continue;
    // `targetRef` is opaque, so the target's own kind says which family owns it. A registry rather than a
    // shape probe: the two 2D-skeletal formats animate eight things that are not bone transforms, and at
    // that width a probe on overlapping field names reroutes a channel silently.
    const bind = getSkeleton2DAnimationTargetBinder(target.kind);
    if (bind === null) continue;
    bind(channel, setup, pose, target, time);
  }
}
