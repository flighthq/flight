// How a Bone2D inherits each axis of its parent's world transform — the vendor-NEUTRAL model of transform
// inheritance, as four independent boolean axes rather than one vendor's enumeration of the combinations.
// Read *during* the single linear world pass (computeSkeleton2DWorldTransforms): each flag is an independent
// keep/strip applied to the decomposed parent transform, so it is a per-bone setup field, not a constraint.
//
//   rotation    — inherit the parent's rotation (its basis orientation).
//   scale       — inherit the parent's scale (its column magnitudes).
//   reflection  — inherit the parent's reflection (a negatively-scaled parent's handedness flip).
//   translation — inherit the parent's translation (the parent places the bone's local origin). When false,
//                 the bone's local (x, y) is its world position directly, ignoring the parent.
//
// Spine and DragonBones both describe this domain: Spine as a 5-value enum (see the `TransformMode2D`
// presets), DragonBones as these four booleans directly. Modelling the axes — not one vendor's enum —
// makes both expressible with no per-vendor gaps. Rotation and reflection are distinct axes because a
// parent's basis carries an orientation (angle) and a handedness (det sign) that can be inherited
// independently.
export interface TransformInherit2D {
  reflection: boolean;
  rotation: boolean;
  scale: boolean;
  translation: boolean;
}
