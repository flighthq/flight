import type { Entity } from './Entity';
import type { Node3D } from './Node3D';

// A skin: an ordered set of joint (bone) Node3Ds plus their inverse-bind matrices, and the computed
// skin palette the renderer (or a CPU skinner) consumes. The joints are ordinary Node3Ds in the scene
// hierarchy — they are animated like any node (the animation core drives them through the scene binding),
// so the skeleton itself only owns the skinning math, not a second hierarchy.
//
// `inverseBindMatrices` and `jointMatrices` are flat column-major 4x4 blocks, 16 floats per joint, in
// joint order. `jointMatrices` is the palette filled by computeSkeleton3DJointMatrices each frame
// (jointWorldMatrix * inverseBindMatrix per joint) and uploaded as the bone uniform; a vertex is
// deformed by the weighted sum of its joints' palette matrices.
export interface Skeleton3D extends Entity {
  inverseBindMatrices: Float32Array;
  jointMatrices: Float32Array;
  // The per-joint NORMAL palette: flat 3x3 blocks, 9 floats per joint, in joint order, filled beside
  // `jointMatrices` each frame. Each block is the inverse-transpose of that joint's upper 3x3, which is
  // what a normal must transform by — a normal is a covector, so under non-uniform scale it does NOT
  // follow the same matrix as a position or a tangent.
  //
  // ★ BLENDING THESE IS AN APPROXIMATION, AND A DELIBERATE ONE. The inverse-transpose OF the blended
  // matrix is not the blend OF the per-joint inverse-transposes — they are different matrices. Computing
  // the exact answer would mean inverting a freshly blended 3x3 per vertex per frame, which is not
  // affordable in a skinning inner loop. This is the standard trade, and it is stated here so a later
  // reader does not mistake it for the mathematically precise result.
  normalMatrices: Float32Array;
  joints: Node3D[];
  // Optional per-joint names, aligned by index with `joints`, for name-based lookup and prop socketing
  // (getSkeleton3DJointIndexByName). Omitted or null when the source (e.g. a nameless glTF skin) has none.
  names?: readonly string[] | null;
}
