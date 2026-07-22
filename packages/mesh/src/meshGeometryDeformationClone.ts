import { createAabb } from '@flighthq/geometry';
import type { MeshGeometry, MeshMorphBindPose, MeshSkinBindPose } from '@flighthq/types';

import { cloneMeshGeometry, getMeshGeometryMorphBindPose, getMeshGeometrySkinBindPose } from './meshGeometry';
import { getVertexAttributeFloatOffset } from './meshGeometryAttributes';
import { computeMeshGeometryBounds } from './meshGeometryCompute';

// Clones geometry for an independently updated CPU-deformed mesh. Unlike the general clone, this
// restores the deepest captured undeformed attributes when the source has already been morphed or
// skinned, then gives the clone a fresh runtime so its future bind-pose scratch cannot alias source.
// Rigid callers should keep using cloneMeshGeometry (or share geometry) and pay no extra work.
export function cloneMeshGeometryForDeformation(source: Readonly<MeshGeometry>): MeshGeometry {
  const clone = cloneMeshGeometry(source);
  const morphBindPose = getMeshGeometryMorphBindPose(source);
  const skinBindPose = getMeshGeometrySkinBindPose(source);
  if (morphBindPose !== null) restoreMorphBindPose(clone, morphBindPose);
  else if (skinBindPose !== null) restoreSkinBindPose(clone, skinBindPose);

  const bounds = createAabb();
  computeMeshGeometryBounds(bounds, clone);
  clone.bounds = bounds;
  return clone;
}

function restoreMorphBindPose(geometry: MeshGeometry, bindPose: Readonly<MeshMorphBindPose>): void {
  restoreFloat3(geometry, 'position', bindPose.positions);
  if (bindPose.normals !== null) restoreFloat3(geometry, 'normal', bindPose.normals);
  if (bindPose.tangents !== null) restoreFloat3(geometry, 'tangent', bindPose.tangents);
}

function restoreSkinBindPose(geometry: MeshGeometry, bindPose: Readonly<MeshSkinBindPose>): void {
  restoreFloat3(geometry, 'position', bindPose.positions);
  restoreFloat3(geometry, 'normal', bindPose.normals);
}

function restoreFloat3(
  geometry: MeshGeometry,
  semantic: 'normal' | 'position' | 'tangent',
  source: Readonly<Float32Array>,
): void {
  const offset = getVertexAttributeFloatOffset(geometry.layout, semantic);
  if (offset < 0) return;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = Math.min((geometry.vertices.length / floatsPerVertex) | 0, (source.length / 3) | 0);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const target = vertex * floatsPerVertex + offset;
    const from = vertex * 3;
    geometry.vertices[target] = source[from];
    geometry.vertices[target + 1] = source[from + 1];
    geometry.vertices[target + 2] = source[from + 2];
  }
}
