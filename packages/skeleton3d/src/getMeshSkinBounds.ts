import type { AabbLike, MeshSkinBindPose, Skeleton3D } from '@flighthq/types';

import { skinVertices } from './skinVertices';

// Skinned-mesh local-space bounds. Two functions, same signature, trading tightness for cost:
// getMeshSkinConservativeBounds is the cheap culling default (no per-vertex skinning — expands the
// rest-pose box by the palette's per-joint motion), getMeshSkinExactBounds is the opt-in accurate
// path (skins every vertex on the CPU). Both operate on the captured bind pose and the skeleton's
// already-computed palette (call computeSkeleton3DJointMatrices first), and both write into `out`.

// Writes a CONSERVATIVE axis-aligned bound of the skinned mesh into `out` without skinning any
// vertex — the cheap default for culling. Each skinned vertex position is a convex combination
// (non-negative weights summing to ≤ 1) of its influencing joints' palette-transformed rest
// positions, so it lies inside the union of {Mⱼ · restBounds} over the referenced joints j; the
// AABB of that union (this function's result) therefore encloses every skinned vertex. Loose but
// never wrong: getMeshSkinExactBounds's result is always contained in this one. Cost is the
// rest-pose box (one pass over bindPose.positions, computed once conceptually) plus one box-transform
// per referenced joint — no matrix multiply per vertex. Reads the rest bounds into locals before
// writing, so it is safe when `out` aliases nothing it reads (it holds no input reference to `out`).
// An empty mesh (no rest positions) yields the empty box (min = +Infinity, max = -Infinity).
export function getMeshSkinConservativeBounds(
  out: AabbLike,
  bindPose: Readonly<MeshSkinBindPose>,
  skeleton: Readonly<Skeleton3D>,
): void {
  const positions = bindPose.positions;
  const restVertexCount = (positions.length / 3) | 0;

  let restMinX = Number.POSITIVE_INFINITY,
    restMinY = Number.POSITIVE_INFINITY,
    restMinZ = Number.POSITIVE_INFINITY;
  let restMaxX = Number.NEGATIVE_INFINITY,
    restMaxY = Number.NEGATIVE_INFINITY,
    restMaxZ = Number.NEGATIVE_INFINITY;
  for (let v = 0; v < restVertexCount; v++) {
    const p = v * 3;
    const px = positions[p],
      py = positions[p + 1],
      pz = positions[p + 2];
    if (px < restMinX) restMinX = px;
    if (py < restMinY) restMinY = py;
    if (pz < restMinZ) restMinZ = pz;
    if (px > restMaxX) restMaxX = px;
    if (py > restMaxY) restMaxY = py;
    if (pz > restMaxZ) restMaxZ = pz;
  }

  // Empty rest pose → empty box, no joints to sweep.
  if (restVertexCount === 0) {
    out.min.x = Number.POSITIVE_INFINITY;
    out.min.y = Number.POSITIVE_INFINITY;
    out.min.z = Number.POSITIVE_INFINITY;
    out.max.x = Number.NEGATIVE_INFINITY;
    out.max.y = Number.NEGATIVE_INFINITY;
    out.max.z = Number.NEGATIVE_INFINITY;
    return;
  }

  // Rest-box center + half-extents, transformed per joint via center + |M|·extent (the same
  // affine-box-transform used by transformAabbByMatrix4), then unioned.
  const cx = (restMinX + restMaxX) * 0.5,
    cy = (restMinY + restMaxY) * 0.5,
    cz = (restMinZ + restMaxZ) * 0.5;
  const ex = (restMaxX - restMinX) * 0.5,
    ey = (restMaxY - restMinY) * 0.5,
    ez = (restMaxZ - restMinZ) * 0.5;

  const palette = skeleton.jointMatrices;
  const jointCount = (palette.length / 16) | 0;
  const referenced = getReferencedJoints(bindPose.joints, bindPose.weights, jointCount);

  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY;

  for (let j = 0; j < jointCount; j++) {
    if (!referenced[j]) continue;
    const m = j * 16;

    const tcx = palette[m] * cx + palette[m + 4] * cy + palette[m + 8] * cz + palette[m + 12];
    const tcy = palette[m + 1] * cx + palette[m + 5] * cy + palette[m + 9] * cz + palette[m + 13];
    const tcz = palette[m + 2] * cx + palette[m + 6] * cy + palette[m + 10] * cz + palette[m + 14];

    const tex = Math.abs(palette[m]) * ex + Math.abs(palette[m + 4]) * ey + Math.abs(palette[m + 8]) * ez;
    const tey = Math.abs(palette[m + 1]) * ex + Math.abs(palette[m + 5]) * ey + Math.abs(palette[m + 9]) * ez;
    const tez = Math.abs(palette[m + 2]) * ex + Math.abs(palette[m + 6]) * ey + Math.abs(palette[m + 10]) * ez;

    if (tcx - tex < minX) minX = tcx - tex;
    if (tcy - tey < minY) minY = tcy - tey;
    if (tcz - tez < minZ) minZ = tcz - tez;
    if (tcx + tex > maxX) maxX = tcx + tex;
    if (tcy + tey > maxY) maxY = tcy + tey;
    if (tcz + tez > maxZ) maxZ = tcz + tez;
  }

  out.min.x = minX;
  out.min.y = minY;
  out.min.z = minZ;
  out.max.x = maxX;
  out.max.y = maxY;
  out.max.z = maxZ;
}

// Writes the EXACT (tight) axis-aligned bound of the skinned mesh into `out` — the opt-in accurate
// path. Linear-blend-skins every vertex on the CPU via the same kernel skinMeshGeometry uses
// (writing through bindPose.skinnedPositions scratch, so it allocates nothing), then takes the tight
// AABB of the skinned positions. Use for precise picking or a leaf-level bound where the conservative
// sweep is too loose; prefer getMeshSkinConservativeBounds for per-frame culling. An empty mesh
// yields the empty box (min = +Infinity, max = -Infinity). Overwrites bindPose.skinnedPositions /
// skinnedNormals as scratch (the same buffers a subsequent skinMeshGeometry would rewrite).
export function getMeshSkinExactBounds(
  out: AabbLike,
  bindPose: Readonly<MeshSkinBindPose>,
  skeleton: Readonly<Skeleton3D>,
): void {
  skinVertices(
    bindPose.skinnedPositions,
    bindPose.skinnedNormals,
    bindPose.positions,
    bindPose.normals,
    bindPose.joints,
    bindPose.weights,
    skeleton.jointMatrices,
  );

  const skinned = bindPose.skinnedPositions;
  const vertexCount = (skinned.length / 3) | 0;

  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY;

  for (let v = 0; v < vertexCount; v++) {
    const p = v * 3;
    const px = skinned[p],
      py = skinned[p + 1],
      pz = skinned[p + 2];
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }

  out.min.x = minX;
  out.min.y = minY;
  out.min.z = minZ;
  out.max.x = maxX;
  out.max.y = maxY;
  out.max.z = maxZ;
}

// Marks which palette joints an actual influence references (nonzero weight), so the conservative
// sweep unions only the joints that can move a vertex — not every joint in the palette. One pass over
// the static 4-influence binding; out-of-range or zero-weight influences are skipped.
function getReferencedJoints(
  joints: Readonly<Float32Array>,
  weights: Readonly<Float32Array>,
  jointCount: number,
): Uint8Array {
  const referenced = new Uint8Array(jointCount);
  const influenceCount = joints.length;
  for (let k = 0; k < influenceCount; k++) {
    if (weights[k] === 0) continue;
    const j = joints[k] | 0;
    if (j >= 0 && j < jointCount) referenced[j] = 1;
  }
  return referenced;
}
