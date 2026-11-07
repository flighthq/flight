// How a Mesh's geometry is deformed each frame, independent of its node kind. `none` draws the
// geometry rigidly, `skeletal` skins it from a Skeleton3D palette, and `morph` blends its targets.
export const MeshDeformerMorph = 'morph';
export const MeshDeformerNone = 'none';
export const MeshDeformerSkeletal = 'skeletal';

export type MeshDeformer = 'morph' | 'none' | 'skeletal';
