import { sampleAnimationTrack } from '@flighthq/animation/contract';
import type { AnimationClip, Skeleton2D, Skeleton2DAnimationTarget } from '@flighthq/types/contract';
import { Skeleton2DAnimationPath } from '@flighthq/types/contract';

// Poses `pose` from an AnimationClip at `time` by COMPOSING each channel's sampled value onto the
// corresponding `setup` bone — the 2D-skeletal analogue of @flighthq/scene3d's `applyAnimationClipToScene3D`,
// but relative rather than absolute. This mirrors Spine's SkeletonData(setup)/Skeleton(instance) split:
// `setup` is the immutable rest pose, `pose` is the animated instance (typically a `cloneSkeleton2D(setup)`),
// and a clip carries RELATIVE deltas — translate/rotate/shear ADD to setup, scale MULTIPLIES it (Spine's
// timeline semantics; the `path` distinguishes which). Composing from `setup` every call (not from `pose`)
// is what makes clips blendable — a mixer accumulates deltas as `pose = setup + Σ wᵢ·deltaᵢ`, which averaging
// baked-absolute poses cannot express — and is why re-applying a clip does not accumulate across frames.
//
// It writes only the bones a channel targets; untouched pose bones keep their clone-of-setup values. The
// caller runs `computeSkeleton2DWorldTransforms(pose, …)` (then the deform) afterward, so a whole clip
// applies before one world propagation. Module scratch, allocation-free. A channel whose target is foreign
// (not a Skeleton2DAnimationTarget) or out of range is skipped (sentinel guard, no throw).
//
// `setup` and `pose` MUST be distinct instances: the binder reads `setup` fields and writes `pose` fields,
// so aliasing them would clobber the rest pose it composes against and accumulate on the next frame.
export function applyAnimationClipToSkeleton2D(
  clip: Readonly<AnimationClip>,
  setup: Readonly<Skeleton2D>,
  pose: Skeleton2D,
  time: number,
): void {
  const channels = clip.channels;
  const setupBones = setup.bones;
  const poseBones = pose.bones;
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const target = channel.targetRef as Skeleton2DAnimationTarget | null;
    if (target === null || typeof target !== 'object' || typeof target.boneIndex !== 'number') continue;
    const boneIndex = target.boneIndex;
    if (boneIndex < 0 || boneIndex >= poseBones.length || boneIndex >= setupBones.length) continue;
    sampleAnimationTrack(_scratch, channel.track, time);
    const setupBone = setupBones[boneIndex];
    const poseBone = poseBones[boneIndex];
    switch (target.path) {
      case Skeleton2DAnimationPath.Translation:
        poseBone.x = setupBone.x + _scratch[0];
        poseBone.y = setupBone.y + _scratch[1];
        break;
      case Skeleton2DAnimationPath.Rotation:
        poseBone.rotation = setupBone.rotation + _scratch[0];
        break;
      case Skeleton2DAnimationPath.Scale:
        poseBone.scaleX = setupBone.scaleX * _scratch[0];
        poseBone.scaleY = setupBone.scaleY * _scratch[1];
        break;
      case Skeleton2DAnimationPath.Shear:
        poseBone.shearX = setupBone.shearX + _scratch[0];
        poseBone.shearY = setupBone.shearY + _scratch[1];
        break;
      default:
        break;
    }
  }
}

const _scratch = [0, 0, 0, 0];
