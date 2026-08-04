// Which group of a Bone2D's local setup-transform fields an AnimationChannel drives — the 2D-skeletal
// analogue of Scene3DAnimationPath, matching Spine/DragonBones bone timeline granularity. A finite
// vocabulary dispatched in the per-channel binder loop, so a closed union with `switch` dispatch, not an
// open registry.
//
//   Translation — drives (x, y)            [Vector2 track, components 2]
//   Rotation    — drives rotation          [scalar track, components 1]
//   Scale       — drives (scaleX, scaleY)  [Vector2 track, components 2]
//   Shear       — drives (shearX, shearY)  [Vector2 track, components 2]
//
// THE PER-AXIS PATHS DRIVE ONE FIELD EACH from a one-component track, and they are not a convenience
// spelling of the paired ones. Both formats author per-axis timelines with INDEPENDENT KEYFRAME TIMES —
// Spine's binary format has distinct ordinals for translateX/translateY and their scale and shear
// siblings, and Rive keys one scalar per property — so the two axes genuinely carry different keyframes
// and different easing.
//
//   TranslationX / TranslationY — drive x / y            [scalar track, components 1]
//   ScaleX / ScaleY             — drive scaleX / scaleY  [scalar track, components 1]
//   ShearX / ShearY             — drive shearX / shearY  [scalar track, components 1]
//
// THE PAIRED PATHS STAY, because Spine JSON and DragonBones do author them paired and a two-component
// track is the honest representation there. Carrying both is not redundancy: it is the two shapes the
// source formats actually use.
//
// WHY NOT RESAMPLE TWO SCALARS INTO ONE PAIRED TRACK: merging independently-timed channels onto a common
// time set means evaluating each axis's curve at times it has no key. Both formats author per-segment
// bezier easing, so sampling a segment at an interior time and re-interpolating linearly between those
// samples produces a DIFFERENT CURVE rather than a denser representation of the same one — and a mixer
// accumulates per-channel deltas, so a resampled pair carries more keys than either source authored and
// blends differently. Inventing keyframe times is the visible symptom; changing the motion is the damage.
//
// Emitting two PAIRED channels for one bone instead is not an option either, and that defect is what these
// exist to fix: each composes onto the SETUP pose, so the second channel writes the first channel's axis
// back to setup and silently destroys it. Measured before the fix — tracks `[7, 0]` and `[0, 5]` applied
// together produced `x = 0, y = 5`, losing the 7 entirely.
export const Skeleton2DAnimationPath = {
  Translation: 'Translation',
  TranslationX: 'TranslationX',
  TranslationY: 'TranslationY',
  Rotation: 'Rotation',
  Scale: 'Scale',
  ScaleX: 'ScaleX',
  ScaleY: 'ScaleY',
  Shear: 'Shear',
  ShearX: 'ShearX',
  ShearY: 'ShearY',
} as const;

export type Skeleton2DAnimationPath = (typeof Skeleton2DAnimationPath)[keyof typeof Skeleton2DAnimationPath];
