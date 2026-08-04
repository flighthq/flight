import { sampleAnimationTrack } from '@flighthq/animation/contract';
import type { AnimationChannel, Skeleton2D, Skeleton2DDeformAnimationTarget } from '@flighthq/types/contract';
import { Skeleton2DAnimationTargetKind } from '@flighthq/types/contract';

import { registerSkeleton2DAnimationTargetBinder } from './skeleton2dAnimationTarget';
import { setSkeleton2DSlotDeform } from './slotDeform2D';

// Opts a bundle into deform channels. Unlike the bone and slot binders — which are pre-entered because a
// bundle that shed them would leave the pose pass a silent no-op — a rig with no deform timeline should
// not carry this, so it registers explicitly like a constraint solver does.
export function registerSkeleton2DDeformAnimationTarget(): void {
  registerSkeleton2DAnimationTargetBinder(Skeleton2DAnimationTargetKind.Deform, bindSkeleton2DDeformChannel);
}

// Samples a deform channel onto its slot, stamping the attachment the offsets were authored for so the
// pull seam can reject them once the slot shows something else.
//
// The track is ordinary and numeric: `components` is the whole offset stream length, so a keyframe is one
// complete set of offsets and `sampleAnimationTrack` interpolates between them normally. That is the right
// behaviour here and the opposite of an attachment-swap index — a morph that snapped between drawn keys
// instead of blending would be the bug.
//
// A channel whose slot is out of range writes nothing rather than throwing; a rig can carry a timeline for
// a slot a trimmed skeleton no longer has.
function bindSkeleton2DDeformChannel(
  channel: Readonly<AnimationChannel>,
  _setup: Readonly<Skeleton2D>,
  pose: Skeleton2D,
  target: unknown,
  time: number,
): void {
  const deformTarget = target as Readonly<Skeleton2DDeformAnimationTarget>;
  const slots = pose.slots;
  if (slots === undefined || slots === null) return;
  const slotIndex = deformTarget.slotIndex;
  if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex >= slots.length) return;

  const components = channel.track.components;
  if (components <= 0) return;
  if (_scratch.length < components) _scratch = new Float32Array(components);
  sampleAnimationTrack(_scratch, channel.track, time);
  // `_scratch` may be longer than the stream after a previous, wider channel, so only the components this
  // track actually carries are written.
  setSkeleton2DSlotDeform(slots[slotIndex], deformTarget.attachment ?? null, _scratch.subarray(0, components));
}

let _scratch = new Float32Array(0);
