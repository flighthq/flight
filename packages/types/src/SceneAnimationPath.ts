// Which transform component of a SceneNode an animation channel drives. The sampled value is a
// Vector3 (3 components) for Translation and Scale, and a unit quaternion (4 components) for Rotation.
export type SceneAnimationPath = 'Rotation' | 'Scale' | 'Translation';

export const SceneAnimationPathRotation = 'Rotation';
export const SceneAnimationPathScale = 'Scale';
export const SceneAnimationPathTranslation = 'Translation';
