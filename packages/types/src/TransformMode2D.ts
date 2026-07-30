import type { TransformInherit2D } from './TransformInherit2D';

// Named `TransformInherit2D` presets for the five Spine/DragonBones inherit modes — a one-token authoring
// vocabulary over the four-axis boolean model, not a distinct type. A caller who thinks in Spine terms
// writes `TransformMode2D.NoScale`; a caller who needs an arbitrary axis combination (e.g. a DragonBones
// bone that keeps rotation and scale but strips reflection) sets the `TransformInherit2D` booleans directly.
// The presets are module constants shared by reference, so a bone assigned a preset compares identity-equal
// to it (cloneSkeleton2D keeps the reference — the value is immutable by convention).
//
//   Normal                 — inherit rotation + scale + reflection + translation (world = parent × local).
//   OnlyTranslation        — inherit translation only; rotation/scale come from the bone's own local setup
//                            (e.g. a held item that stays upright on a rotating arm).
//   NoRotationOrReflection — inherit the parent's scale but strip its rotation and reflection.
//   NoScale                — inherit the parent's rotation and reflection but not its scale.
//   NoScaleOrReflection    — inherit the parent's rotation but neither its scale nor its reflection.
export const TransformMode2D = {
  Normal: { reflection: true, rotation: true, scale: true, translation: true },
  OnlyTranslation: { reflection: false, rotation: false, scale: false, translation: true },
  NoRotationOrReflection: { reflection: false, rotation: false, scale: true, translation: true },
  NoScale: { reflection: true, rotation: true, scale: false, translation: true },
  NoScaleOrReflection: { reflection: false, rotation: true, scale: false, translation: true },
} satisfies Record<string, TransformInherit2D>;
