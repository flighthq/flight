// Which group of a Bone2D's local setup-transform fields an AnimationChannel drives — the 2D-skeletal
// analogue of Scene3DAnimationPath, matching Spine/DragonBones bone timeline granularity (translate/rotate/
// scale/shear are the four bone timeline kinds). A finite vocabulary dispatched in the per-channel binder
// loop, so a closed union with `switch` dispatch, not an open registry.
//
//   Translation — drives (x, y)            [Vector2 track, components 2]
//   Rotation    — drives rotation          [scalar track, components 1]
//   Scale       — drives (scaleX, scaleY)  [Vector2 track, components 2]
//   Shear       — drives (shearX, shearY)  [Vector2 track, components 2]
export const Skeleton2DAnimationPath = {
  Translation: 'Translation',
  Rotation: 'Rotation',
  Scale: 'Scale',
  Shear: 'Shear',
} as const;

export type Skeleton2DAnimationPath = (typeof Skeleton2DAnimationPath)[keyof typeof Skeleton2DAnimationPath];
