// Which sink of a SceneNode an animation channel drives. Rotation/Scale/Translation drive a transform
// component: the sampled value is a Vector3 (3 components) for Translation and Scale, and a unit
// quaternion (4 components) for Rotation. Weights drives a Mesh's morph-target weight array instead of
// its transform: the sampled value is one weight per morph target (width = the mesh's target count),
// fed to the morph deformer (base + Σ wᵢ·targetᵢ) rather than the skeletal one. This is glTF's model —
// channel.target.path already admits "weights" — and the unifying seam for the two deformers: TRS
// channels write node transforms, weights channels write the mesh weight array; the Sampler and track
// machinery are identical, only the sink differs.
export type SceneAnimationPath = 'Rotation' | 'Scale' | 'Translation' | 'Weights';

export const SceneAnimationPathRotation = 'Rotation';
export const SceneAnimationPathScale = 'Scale';
export const SceneAnimationPathTranslation = 'Translation';
export const SceneAnimationPathWeights = 'Weights';
