import type { Bone2D } from './Bone2D';
import type { Entity } from './Entity';
import type { Slot2D } from './Slot2D';

// A 2D skeleton: a flat, parent-before-child ordered bone array plus the transform buffers the deformer
// and attachment layers consume, and its draw slots. The 2D sibling of Skeleton3D — but self-contained:
// it OWNS its bones (Bone2D local setup transforms, mutated by animation) and propagates their world
// transforms itself, rather than reading external posed nodes. The Spine/DragonBones model.
//
// `worldMatrices`, `inverseBindMatrices`, and `boneMatrices` are flat 2×3 affine blocks — 6 floats per
// bone (a, b, c, d, tx, ty) in bone order:
//   worldMatrices        — each bone's world transform; filled by computeSkeleton2DWorldTransforms from
//                          the bones' local setup transforms + inherit modes.
//   inverseBindMatrices  — the setup-pose inverse; captured once by setSkeleton2DBindPose.
//   boneMatrices         — the skin palette (world × inverseBind); filled by computeSkeleton2DBoneMatrices,
//                          consumed by the weighted vertex deformer for meshes that skin by palette.
// A rigid region/mesh attachment reads `worldMatrices` (it follows its bone); a Spine-weighted mesh reads
// `worldMatrices` too (its offsets bake the bind, see Skin2D). `slots` is the draw-order list (null for a
// pure bone rig with nothing drawable).
export interface Skeleton2D extends Entity {
  boneMatrices: Float32Array;
  bones: Bone2D[];
  inverseBindMatrices: Float32Array;
  slots?: Slot2D[] | null;
  worldMatrices: Float32Array;
}
