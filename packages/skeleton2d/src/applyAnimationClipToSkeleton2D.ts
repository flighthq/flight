import { sampleAnimationTrack } from '@flighthq/animation/contract';
import type {
  AnimationChannel,
  AnimationClip,
  Skeleton2D,
  Skeleton2DAnimationTarget,
  Skeleton2DSlotAnimationTarget,
  Slot2D,
} from '@flighthq/types/contract';
import { Skeleton2DAnimationPath, Skeleton2DSlotAnimationPath } from '@flighthq/types/contract';

// Poses `pose` from an AnimationClip at `time` by COMPOSING each channel's sampled value onto the
// corresponding `setup` bone — the 2D-skeletal analogue of @flighthq/scene3d's `applyAnimationClipToScene3D`,
// but relative rather than absolute. This mirrors Spine's SkeletonData(setup)/Skeleton(instance) split:
// `setup` is the immutable rest pose, `pose` is the animated instance (typically a `cloneSkeleton2D(setup)`),
// and a clip carries RELATIVE deltas — translate/rotate/shear ADD to setup, scale MULTIPLIES it (Spine's
// timeline semantics; the `path` distinguishes which). Composing from `setup` every call (not from `pose`)
// is what makes clips blendable — a mixer accumulates deltas as `pose = setup + Σ wᵢ·deltaᵢ`, which averaging
// baked-absolute poses cannot express — and is why re-applying a clip does not accumulate across frames.
//
// A clip may also carry SLOT channels (a `Skeleton2DSlotAnimationTarget` rather than a bone target). Those
// are dispatched by target SHAPE and follow different rules: a slot colour is an ABSOLUTE authored value, so
// it is written rather than composed, and `setup` is not consulted at all on that path. See
// applySkeleton2DSlotChannel.
//
// It writes only the bones a channel targets; untouched pose bones keep their clone-of-setup values. The
// caller runs `computeSkeleton2DWorldTransforms(pose, …)` (then the deform) afterward, so a whole clip
// applies before one world propagation. Module scratch, allocation-free. A channel whose target is foreign
// (not a Skeleton2DAnimationTarget) or out of range is skipped (sentinel guard, no throw).
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
  const setupBones = setup.bones;
  const poseBones = pose.bones;
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const target = channel.targetRef as Skeleton2DAnimationTarget | null;
    if (target === null || typeof target !== 'object') continue;
    // `targetRef` is opaque, so the shape itself says which array a channel addresses: a bone target names
    // a bone index, a slot target names a slot index. Probing (rather than a discriminator field) is what
    // lets slot channels be purely additive to a bone-only clip format.
    if (typeof target.boneIndex !== 'number') {
      applySkeleton2DSlotChannel(channel, pose, target as unknown as Skeleton2DSlotAnimationTarget, time);
      continue;
    }
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

// Writes one slot channel's sampled value onto the pose slot. Unlike a bone channel this COMPOSES NOTHING:
// Spine and DragonBones both author slot colour as an ABSOLUTE value, so the sample replaces the slot's
// colour rather than tinting the setup colour again. There is therefore no `setup` read on this path.
//
// Channels are NORMALIZED 0..1 in R,G,B,A order and scaled to bytes here. The track holds 0..1 rather than
// 0..255 because that is the space Spine authors colour CURVE control points in — a byte-scaled track would
// rebase every colour easing against the wrong range. Samples are CLAMPED: a bezier segment may legitimately
// overshoot its endpoints (anticipation curves do), and an out-of-range channel would otherwise wrap when
// packed and flip the colour.
function applySkeleton2DSlotChannel(
  channel: Readonly<AnimationChannel>,
  pose: Skeleton2D,
  target: Readonly<Skeleton2DSlotAnimationTarget>,
  time: number,
): void {
  const slots = pose.slots;
  if (slots === undefined || slots === null) return;
  const slotIndex = target.slotIndex;
  if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex >= slots.length) return;
  if (target.path === Skeleton2DSlotAnimationPath.Attachment) {
    applySkeleton2DSlotAttachment(channel, slots[slotIndex], target, time);
    return;
  }
  if (target.path !== Skeleton2DSlotAnimationPath.Color) return;
  sampleAnimationTrack(_scratch, channel.track, time);
  slots[slotIndex].color =
    ((clampColorChannel(_scratch[0]) << 24) |
      (clampColorChannel(_scratch[1]) << 16) |
      (clampColorChannel(_scratch[2]) << 8) |
      clampColorChannel(_scratch[3])) >>>
    0;
}

// Swaps the slot's attachment by looking the sampled INDEX up in the target's table.
//
// It reads the track with its own STEP walk rather than `sampleAnimationTrack`, and that is deliberate
// rather than duplication: an attachment index must never be interpolated. If a track were built (or later
// edited) as Linear, sampling would blend between two TABLE INDICES and hand back something between them —
// a plausible-looking index that names the wrong art, or a fractional one. Forcing the step here means the
// channel is correct regardless of what the track claims its interpolation is.
//
// An index outside the table, or the `-1` Spine writes for "no attachment", clears the slot.
function applySkeleton2DSlotAttachment(
  channel: Readonly<AnimationChannel>,
  slot: Slot2D,
  target: Readonly<Skeleton2DSlotAnimationTarget>,
  time: number,
): void {
  const table = target.attachments;
  if (table === undefined || table === null) return;
  const times = channel.track.times;
  const count = times.length;
  if (count === 0) return;
  // The last keyframe at or before `time`; before the first keyframe the first value holds.
  let keyframe = 0;
  for (let i = count - 1; i >= 0; i--) {
    if (times[i] <= time) {
      keyframe = i;
      break;
    }
  }
  const index = Math.round(channel.track.values[keyframe * channel.track.components]);
  slot.attachment = index >= 0 && index < table.length ? table[index] : null;
}

function clampColorChannel(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
}

const _scratch = [0, 0, 0, 0];
