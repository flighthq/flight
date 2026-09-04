import { sampleAnimationTrack } from '@flighthq/animation/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createKeyedTable,
  getRegistryTableEntry,
  getRegistryTableKeys,
  withRegistryTableEntry,
  withoutRegistryTableEntry,
} from '@flighthq/registry/contract';
import type {
  AnimationChannel,
  Attachment2D,
  EntityConstruction,
  KeyedTable,
  Skeleton2D,
  Skeleton2DAnimationPath,
  Skeleton2DAnimationTarget,
  Skeleton2DAnimationTargetBinder,
  Skeleton2DAnimationTargetKind,
  Skeleton2DSlotAnimationPath,
  Skeleton2DSlotAnimationTarget,
  Slot2D,
} from '@flighthq/types/contract';
import {
  Skeleton2DAnimationPath as BonePath,
  Skeleton2DAnimationTargetKind as TargetKind,
  Skeleton2DSlotAnimationPath as SlotPath,
} from '@flighthq/types/contract';

import { reportSkeleton2DCoercedInterpolation } from './skeleton2dGuards';

// The binding target for a bone transform channel. Prefer this over a literal: `kind` is what the binder
// dispatches on, and a target that omits it binds to nothing.
export function createSkeleton2DBoneAnimationTarget(
  boneIndex: number,
  path: Skeleton2DAnimationPath,
): Skeleton2DAnimationTarget {
  const out = allocateEntity<Skeleton2DAnimationTarget>();
  out.boneIndex = boneIndex;
  out.kind = TargetKind.Bone;
  out.path = path;
  return finishEntity(out);
}

// The binding target for a slot appearance channel. `attachments` is the lookup table an Attachment
// channel's index track resolves through, and is left null on a colour channel.
export function createSkeleton2DSlotAnimationTarget(
  slotIndex: number,
  path: Skeleton2DSlotAnimationPath,
  attachments: readonly (Attachment2D | null)[] | null = null,
): Skeleton2DSlotAnimationTarget {
  const out = allocateEntity<Skeleton2DAnimationTarget>();
  out.attachments = attachments;
  out.kind = TargetKind.Slot;
  out.path = path;
  out.slotIndex = slotIndex;
  return finishEntity(out);
}

/**
 * The last keyframe at or before `time`, or -1 when the track holds none. Before the first keyframe the
 * first value holds, which is why an early time resolves to 0 rather than to nothing.
 *
 * Shared by every family whose value cannot be blended — attachment indices and draw orders both — so the
 * two walk identically instead of drifting apart in separate copies of the same loop.
 */
export function findSkeleton2DStepKeyframe(times: ArrayLike<number>, time: number): number {
  const count = times.length;
  if (count === 0) return -1;
  for (let i = count - 1; i >= 0; i--) {
    if (times[i] <= time) return i;
  }
  return 0;
}

// The binder registered for a target kind, or null when nothing claims it — the sentinel a channel with a
// foreign or unregistered target is skipped on.
export function getSkeleton2DAnimationTargetBinder(
  kind: Skeleton2DAnimationTargetKind,
): Skeleton2DAnimationTargetBinder | null {
  return getRegistryTableEntry(getSkeleton2DAnimationTargetBinderRegistry(), kind);
}

// A sorted snapshot of every target kind with a binder. The array is detached from process-wide registry
// state, so callers can inspect or mutate it without changing which channels the posing pass can bind.
export function getSkeleton2DAnimationTargetBinderKinds(): readonly Skeleton2DAnimationTargetKind[] {
  const kinds: Skeleton2DAnimationTargetKind[] = [];
  getRegistryTableKeys(kinds, getSkeleton2DAnimationTargetBinderRegistry());
  return kinds;
}

// Claims a target kind for a binder, so a family this package does not own — a constraint solver's
// channels, a vendor's own rig feature — poses through the same single pass as bones and slots instead of
// needing a second one. Last write wins, which is what lets a caller replace a built-in binding; collisions
// between third parties are avoided by the vendor-prefix convention rather than by a guard.
export function registerSkeleton2DAnimationTargetBinder(
  kind: Skeleton2DAnimationTargetKind,
  bind: Skeleton2DAnimationTargetBinder,
): void {
  _binders = withRegistryTableEntry(getSkeleton2DAnimationTargetBinderRegistry(), kind, bind);
}

export function unregisterSkeleton2DAnimationTargetBinder(kind: Skeleton2DAnimationTargetKind): void {
  _binders = withoutRegistryTableEntry(getSkeleton2DAnimationTargetBinderRegistry(), kind);
}

// Composes one bone channel's sampled delta onto the setup bone. Translate, rotate and shear ADD; scale
// MULTIPLIES. Reading from `setup` rather than from `pose` is what keeps a clip blendable and what stops
// re-applying it from accumulating across frames.
function bindSkeleton2DBoneChannel(
  channel: Readonly<AnimationChannel>,
  setup: Readonly<Skeleton2D>,
  pose: Skeleton2D,
  target: unknown,
  time: number,
): void {
  const boneTarget = target as Readonly<Skeleton2DAnimationTarget>;
  const boneIndex = boneTarget.boneIndex;
  const setupBones = setup.bones;
  const poseBones = pose.bones;
  if (typeof boneIndex !== 'number') return;
  if (boneIndex < 0 || boneIndex >= poseBones.length || boneIndex >= setupBones.length) return;
  sampleAnimationTrack(_scratch, channel.track, time);
  const setupBone = setupBones[boneIndex];
  const poseBone = poseBones[boneIndex];
  switch (boneTarget.path) {
    case BonePath.Translation:
      poseBone.x = setupBone.x + _scratch[0];
      poseBone.y = setupBone.y + _scratch[1];
      break;
    case BonePath.Rotation:
      poseBone.rotation = setupBone.rotation + _scratch[0];
      break;
    case BonePath.Scale:
      poseBone.scaleX = setupBone.scaleX * _scratch[0];
      poseBone.scaleY = setupBone.scaleY * _scratch[1];
      break;
    case BonePath.Shear:
      poseBone.shearX = setupBone.shearX + _scratch[0];
      poseBone.shearY = setupBone.shearY + _scratch[1];
      break;
    // The per-axis paths read a one-component track and touch a single field, so the other axis keeps
    // whatever the clone of setup gave it — which is what lets two independently-timed axis channels
    // coexist on one bone instead of overwriting each other back to setup.
    case BonePath.TranslationX:
      poseBone.x = setupBone.x + _scratch[0];
      break;
    case BonePath.TranslationY:
      poseBone.y = setupBone.y + _scratch[0];
      break;
    case BonePath.ScaleX:
      poseBone.scaleX = setupBone.scaleX * _scratch[0];
      break;
    case BonePath.ScaleY:
      poseBone.scaleY = setupBone.scaleY * _scratch[0];
      break;
    case BonePath.ShearX:
      poseBone.shearX = setupBone.shearX + _scratch[0];
      break;
    case BonePath.ShearY:
      poseBone.shearY = setupBone.shearY + _scratch[0];
      break;
    default:
      break;
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
function bindSkeleton2DSlotChannel(
  channel: Readonly<AnimationChannel>,
  _setup: Readonly<Skeleton2D>,
  pose: Skeleton2D,
  target: unknown,
  time: number,
): void {
  const slotTarget = target as Readonly<Skeleton2DSlotAnimationTarget>;
  const slots = pose.slots;
  if (slots === undefined || slots === null) return;
  const slotIndex = slotTarget.slotIndex;
  if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex >= slots.length) return;
  if (slotTarget.path === SlotPath.Attachment) {
    bindSkeleton2DSlotAttachment(channel, slots[slotIndex], slotTarget, time);
    return;
  }
  if (slotTarget.path !== SlotPath.Color) return;
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
function bindSkeleton2DSlotAttachment(
  channel: Readonly<AnimationChannel>,
  slot: Slot2D,
  target: Readonly<Skeleton2DSlotAnimationTarget>,
  time: number,
): void {
  const table = target.attachments;
  if (table === undefined || table === null) return;
  const keyframe = findSkeleton2DStepKeyframe(channel.track.times, time);
  if (keyframe < 0) return;
  // The coercion is correct but must not be invisible: an author who set an easing here would
  // otherwise never learn it had no effect. enableSkeleton2DGuards turns this into a message.
  if (channel.track.interpolation !== STEP_INTERPOLATION) {
    reportSkeleton2DCoercedInterpolation('Attachment', channel.track.interpolation, STEP_INTERPOLATION);
  }
  const index = Math.round(channel.track.values[keyframe * channel.track.components]);
  slot.attachment = index >= 0 && index < table.length ? table[index] : null;
}

function clampColorChannel(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
}

// The bone and slot binders are entered here rather than through an `enable*` call the caller has to
// remember, because posing a rig from a clip is what this package IS — a skeleton2d bundle that shed the
// bone binder would leave `applyAnimationClipToSkeleton2D` a silent no-op. Every family beyond those two
// registers explicitly and shakes out when unused, which is the part the registry buys. The table is
// created on first use, so importing the package performs no observable registration.
function getSkeleton2DAnimationTargetBinderRegistry(): KeyedTable<Skeleton2DAnimationTargetBinder> {
  if (_binders !== null) return _binders;
  _binders = createKeyedTable('Skeleton2DAnimationTargetBinder', 'Unclaimed');
  _binders = withRegistryTableEntry(_binders, TargetKind.Bone, bindSkeleton2DBoneChannel);
  _binders = withRegistryTableEntry(_binders, TargetKind.Slot, bindSkeleton2DSlotChannel);
  return _binders;
}

let _binders: KeyedTable<Skeleton2DAnimationTargetBinder> | null = null;
const _scratch = [0, 0, 0, 0];

// The walk every non-blendable channel is forced onto, named once so the guard and the walk agree.
const STEP_INTERPOLATION = 'Step';
