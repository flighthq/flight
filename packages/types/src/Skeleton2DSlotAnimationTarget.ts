import type { Attachment2D } from './Attachment2D';
import type { Entity } from './Entity';
import type { Skeleton2DAnimationTargetKind } from './Skeleton2DAnimationTargetKind';

// Which part of a `Slot2D`'s appearance an AnimationChannel drives — the slot-side counterpart of
// `Skeleton2DAnimationPath`, which covers only bone transforms.
//
//   Color      — drives the packed `Slot2D.color`  [Vector4 track, components 4, channels 0..1 R,G,B,A]
//   Attachment — drives which attachment the slot shows [scalar STEP track of indices into `attachments`]
//
// Colour channels are NORMALIZED 0..1, not 0..255, even though `Slot2D.color` packs bytes. That is the space
// Spine authors its colour CURVE control points in, so a 0..255 track would rebase every colour easing
// against the wrong scale; the binder converts to bytes when it packs.
//
// Deliberately small. Spine's second ("dark") slot colour has no `Slot2D` representation at all, and
// draw-order timelines mutate the draw list rather than a value on a slot, so neither is modeled here; both
// are named deferrals rather than oversights (see agents/skeleton2d-animation-model.md).
export const Skeleton2DSlotAnimationPath = {
  Attachment: 'Attachment',
  Color: 'Color',
} as const;

export type Skeleton2DSlotAnimationPath =
  (typeof Skeleton2DSlotAnimationPath)[keyof typeof Skeleton2DSlotAnimationPath];

// The binding target an AnimationChannel carries when it drives a `Slot2D` rather than a bone: which slot
// (by index into the skeleton's draw-order slot array) and which appearance group.
//
// This is a SECOND target type rather than a widening of `Skeleton2DAnimationTarget`, because a bone target
// and a slot target address different arrays. What tells them apart is `kind`, not their field shapes: a
// channel's `targetRef` is typed `unknown` so the binding layer can interpret more than one shape, and
// `applyAnimationClipToSkeleton2D` looks the kind up in a registry rather than probing for a field.
//
// SEMANTIC ASYMMETRY WORTH KNOWING: a bone channel carries a RELATIVE delta that the binder composes onto
// the setup pose (add, or multiply for scale). A slot colour channel carries an ABSOLUTE value that the
// binder WRITES — because that is what both Spine and DragonBones author. Composing a colour onto a setup
// colour would double-apply the tint.
// An `Attachment` channel is the one case where a track's numbers are not the value being animated. Swapping
// an attachment is a step over DISCRETE identities, and `AnimationTrack.values` is `ArrayLike<number>` — so
// the track carries INDICES into `attachments` and the table resolves them. `-1` means "show nothing", which
// is what Spine itself writes (a keyframe with no attachment name hides the slot; spineboy's `shoot` uses it
// to extinguish muzzle flashes). This keeps `@flighthq/animation` numeric rather than widening every track in
// the SDK to carry discrete values for one 2D-skeletal feature.
//
// The table is resolved at IMPORT time against the setup skin, so an attachment-swap channel and a wardrobe
// change do not compose: wearing a different `AttachmentSkin2D` will not re-point a swap channel's entries.
// A rig that both swaps skins and animates attachments needs the table re-resolved for the worn skin, which
// is a named deferral rather than an oversight.
export interface Skeleton2DSlotAnimationTarget extends Entity {
  attachments?: readonly (Attachment2D | null)[] | null;
  kind: Skeleton2DAnimationTargetKind;
  path: Skeleton2DSlotAnimationPath;
  slotIndex: number;
}
