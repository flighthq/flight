import type { SceneNode } from './SceneNode';

// A skin: an ordered set of joint (bone) SceneNodes plus their inverse-bind matrices, and the computed
// skin palette the renderer (or a CPU skinner) consumes. The joints are ordinary SceneNodes in the scene
// hierarchy — they are animated like any node (the animation core drives them through the scene binding),
// so the skeleton itself only owns the skinning math, not a second hierarchy.
//
// `inverseBindMatrices` and `jointMatrices` are flat column-major 4x4 blocks, 16 floats per joint, in
// joint order. `jointMatrices` is the palette filled by computeSkeleton3DJointMatrices each frame
// (jointWorldMatrix * inverseBindMatrix per joint) and uploaded as the bone uniform; a vertex is
// deformed by the weighted sum of its joints' palette matrices.
export interface Skeleton3D {
  inverseBindMatrices: Float32Array;
  jointMatrices: Float32Array;
  joints: SceneNode[];
  // Optional per-joint names, aligned by index with `joints`, for name-based lookup and prop socketing
  // (getSkeleton3DJointIndexByName). Omitted or null when the source (e.g. a nameless glTF skin) has none.
  names?: readonly string[] | null;
}
