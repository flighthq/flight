// How a Bone2D composes its world transform from its parent's — the Spine/DragonBones bone transform
// (inherit) mode. It is read *during* the single linear world-propagation pass
// (computeSkeleton2DWorldTransforms), so it is a per-bone setup field with a branch in that loop, NOT a
// constraint. A finite, well-known vocabulary dispatched in the hot world loop, so a closed union with
// `switch` dispatch (per the types-layout closed-family rule), not an open registry.
//
//   Normal                 — inherit both parent rotation and scale (world = parent × local).
//   OnlyTranslation        — inherit the parent's translation only; the bone's rotation/scale come from
//                            its own local setup, ignoring the parent's (e.g. a held item that stays
//                            upright on a rotating arm).
//   NoRotationOrReflection — inherit the parent's scale but strip its rotation (and reflection).
//   NoScale                — inherit the parent's rotation but not its scale.
//   NoScaleOrReflection    — inherit the parent's rotation but neither its scale nor a reflection.
export const TransformMode2D = {
  Normal: 'Normal',
  OnlyTranslation: 'OnlyTranslation',
  NoRotationOrReflection: 'NoRotationOrReflection',
  NoScale: 'NoScale',
  NoScaleOrReflection: 'NoScaleOrReflection',
} as const;

export type TransformMode2D = (typeof TransformMode2D)[keyof typeof TransformMode2D];
