// How a Mesh's geometry is deformed each frame, independent of its node kind. `none` draws the
// geometry rigidly (the default — a bare Mesh). `skeletal` linear-blend-skins the bind pose by a
// Skeleton3D palette from the geometry's joints0/weights0 channels (Mesh.skin). `morph` blends a base
// mesh by a weighted set of morph targets (base + Σ wᵢ·targetᵢ) from Mesh.morph. Skinning and morph
// are geometry-deform variants a mesh gains by data (skin / morph fields), not distinct node kinds, so
// this tag is derived from which of those fields is populated rather than authored directly — it names
// the deformer families the SDK exposes and lets a renderer or bounds pass branch on the deform kind.
// A mesh may carry both a skin and a morph (corrective shapes over skinning); the composed case is the
// deformer abstraction's `skeletal`+`morph` overlap, not a fourth tag.
export type MeshDeformer = 'morph' | 'none' | 'skeletal';

export const MeshDeformerMorph = 'morph';
export const MeshDeformerNone = 'none';
export const MeshDeformerSkeletal = 'skeletal';
