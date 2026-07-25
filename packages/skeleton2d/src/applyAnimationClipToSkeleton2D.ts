import { sampleAnimationTrack } from '@flighthq/animation';
import type { AnimationClip, Skeleton2D, Skeleton2DAnimationTarget } from '@flighthq/types';
import { Skeleton2DAnimationPath } from '@flighthq/types';

// Poses a Skeleton2D from an AnimationClip at `time`: for each channel whose `targetRef` is a
// Skeleton2DAnimationTarget, samples the channel's track and writes the value into the target bone's local
// setup-transform fields. The 2D-skeletal analogue of @flighthq/scene's `applyAnimationClipToScene`, over
// `Bone2D` instead of a `SceneNode`. It mutates only the bones' local pose — the caller runs
// `computeSkeleton2DWorldTransforms` (then the deform) afterward, so a whole clip applies before one world
// propagation. Module scratch, allocation-free. A channel whose target is foreign (not a
// Skeleton2DAnimationTarget) or out of range is skipped (sentinel guard, no throw).
export function applyAnimationClipToSkeleton2D(
  clip: Readonly<AnimationClip>,
  skeleton: Skeleton2D,
  time: number,
): void {
  const channels = clip.channels;
  const bones = skeleton.bones;
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const target = channel.targetRef as Skeleton2DAnimationTarget | null;
    if (target === null || typeof target !== 'object' || typeof target.boneIndex !== 'number') continue;
    const boneIndex = target.boneIndex;
    if (boneIndex < 0 || boneIndex >= bones.length) continue;
    sampleAnimationTrack(_scratch, channel.track, time);
    const bone = bones[boneIndex];
    switch (target.path) {
      case Skeleton2DAnimationPath.Translation:
        bone.x = _scratch[0];
        bone.y = _scratch[1];
        break;
      case Skeleton2DAnimationPath.Rotation:
        bone.rotation = _scratch[0];
        break;
      case Skeleton2DAnimationPath.Scale:
        bone.scaleX = _scratch[0];
        bone.scaleY = _scratch[1];
        break;
      case Skeleton2DAnimationPath.Shear:
        bone.shearX = _scratch[0];
        bone.shearY = _scratch[1];
        break;
      default:
        break;
    }
  }
}

const _scratch = [0, 0, 0, 0];
