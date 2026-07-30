// Which part of a `Slot2D`'s appearance an AnimationChannel drives — the slot-side counterpart of
// `Skeleton2DAnimationPath`, which covers only bone transforms.
//
//   Color — drives the packed `Slot2D.color` [Vector4 track, components 4, channels 0..1 in R,G,B,A order]
//
// Colour channels are NORMALIZED 0..1, not 0..255, even though `Slot2D.color` packs bytes. That is the space
// Spine authors its colour CURVE control points in, so a 0..255 track would rebase every colour easing
// against the wrong scale; the binder converts to bytes when it packs.
//
// Deliberately small. Spine's second ("dark") slot colour has no `Slot2D` representation at all, and
// draw-order timelines mutate the draw list rather than a value on a slot, so neither is modeled here; both
// are named deferrals rather than oversights (see agents/skeleton2d-animation-model.md).
export const Skeleton2DSlotAnimationPath = {
  Color: 'Color',
} as const;

export type Skeleton2DSlotAnimationPath =
  (typeof Skeleton2DSlotAnimationPath)[keyof typeof Skeleton2DSlotAnimationPath];

// The binding target an AnimationChannel carries when it drives a `Slot2D` rather than a bone: which slot
// (by index into the skeleton's draw-order slot array) and which appearance group.
//
// This is a SECOND target type rather than a widening of `Skeleton2DAnimationTarget`, because a bone target
// and a slot target address different arrays and a bone channel should not have to carry a discriminator it
// never reads. A channel's `targetRef` is typed `unknown` precisely so the binding layer can interpret more
// than one shape; `applyAnimationClipToSkeleton2D` probes for the field that identifies each.
//
// SEMANTIC ASYMMETRY WORTH KNOWING: a bone channel carries a RELATIVE delta that the binder composes onto
// the setup pose (add, or multiply for scale). A slot colour channel carries an ABSOLUTE value that the
// binder WRITES — because that is what both Spine and DragonBones author. Composing a colour onto a setup
// colour would double-apply the tint.
export interface Skeleton2DSlotAnimationTarget {
  path: Skeleton2DSlotAnimationPath;
  slotIndex: number;
}
