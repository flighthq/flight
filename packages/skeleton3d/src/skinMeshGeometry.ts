import { getMeshGeometryVertexJoints0, getMeshGeometryVertexWeights0 } from '@flighthq/mesh/contract';
import type { MeshGeometry, MeshSkinBindPose, Skeleton3D, VertexAttributeLayout } from '@flighthq/types/contract';

import { skinTangents, skinVertices } from './skinVertices';

// Captures the de-interleaved CPU-skinning inputs for one skinned MeshGeometry: the bind-pose
// positions/normals and the static joints0/weights0 influences, read out of the interleaved
// `geometry.vertices` through `geometry.layout` (any offsets, any layout carrying the four
// semantics). Allocates the SoA arrays plus the reusable skinned-output scratch skinMeshGeometry
// writes each frame, so the per-frame deform allocates nothing. Call once, before the first deform,
// and store the result on the geometry's runtime (MeshGeometryRuntime.skinBindPose). Missing
// joints0/weights0 default those influences to zero (an unskinned vertex stays at its bind pose).
export function captureMeshSkinBindPose(geometry: Readonly<MeshGeometry>): MeshSkinBindPose {
  const { layout, vertices } = geometry;
  const floatsPerVertex = layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? (vertices.length / floatsPerVertex) | 0 : 0;

  const positionOffset = floatOffsetForSemantic(layout, 'position');
  const normalOffset = floatOffsetForSemantic(layout, 'normal');
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  // Zero-length when the layout carries no tangent semantic, so the per-frame deform iterates nothing
  // rather than blending meaningless zeros back into a channel the geometry does not have.
  const tangentOffset = floatOffsetForSemantic(layout, 'tangent');
  const tangents = new Float32Array(tangentOffset >= 0 ? vertexCount * 4 : 0);
  const joints = new Float32Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  const joint = { w: 0, x: 0, y: 0, z: 0 };
  const weight = { w: 0, x: 0, y: 0, z: 0 };

  for (let v = 0; v < vertexCount; v++) {
    const base = v * floatsPerVertex;
    const p = v * 3;
    const w = v * 4;
    if (positionOffset >= 0) {
      positions[p] = vertices[base + positionOffset];
      positions[p + 1] = vertices[base + positionOffset + 1];
      positions[p + 2] = vertices[base + positionOffset + 2];
    }
    if (normalOffset >= 0) {
      normals[p] = vertices[base + normalOffset];
      normals[p + 1] = vertices[base + normalOffset + 1];
      normals[p + 2] = vertices[base + normalOffset + 2];
    }
    if (tangentOffset >= 0) {
      // All four floats: xyz is re-blended every frame, w is the handedness sign and rides along.
      tangents[w] = vertices[base + tangentOffset];
      tangents[w + 1] = vertices[base + tangentOffset + 1];
      tangents[w + 2] = vertices[base + tangentOffset + 2];
      tangents[w + 3] = vertices[base + tangentOffset + 3];
    }
    if (getMeshGeometryVertexJoints0(joint, geometry, v)) {
      joints[w] = joint.x;
      joints[w + 1] = joint.y;
      joints[w + 2] = joint.z;
      joints[w + 3] = joint.w;
    }
    if (getMeshGeometryVertexWeights0(weight, geometry, v)) {
      weights[w] = weight.x;
      weights[w + 1] = weight.y;
      weights[w + 2] = weight.z;
      weights[w + 3] = weight.w;
    }
  }

  return {
    joints,
    normals,
    positions,
    skinnedNormals: new Float32Array(vertexCount * 3),
    skinnedPositions: new Float32Array(vertexCount * 3),
    skinnedTangents: new Float32Array(tangents.length),
    tangents,
    weights,
  };
}

// Deforms a skinned MeshGeometry in place for the current pose: linear-blend-skins the bind pose by
// the skeleton's already-computed palette (skeleton.jointMatrices — call computeSkeleton3DJointMatrices
// first) into the bind pose's scratch, writes the skinned positions/normals back into the interleaved
// `geometry.vertices`, and bumps `geometry.version` so the backends re-upload. `bindPose` is the
// capture the caller holds on the geometry runtime; only the position/normal channels are rewritten,
// so tangent/uv0/joints0/weights0 stay intact. Scene3D-free by design — the node-level glue that owns
// the runtime slot and drives the palette is updateMeshSkin, beside this file.
export function skinMeshGeometry(
  geometry: MeshGeometry,
  skeleton: Readonly<Skeleton3D>,
  bindPose: Readonly<MeshSkinBindPose>,
): void {
  skinVertices(
    bindPose.skinnedPositions,
    bindPose.skinnedNormals,
    bindPose.positions,
    bindPose.normals,
    bindPose.joints,
    bindPose.weights,
    skeleton.jointMatrices,
    skeleton.normalMatrices,
  );
  skinTangents(bindPose.skinnedTangents, bindPose.tangents, bindPose.joints, bindPose.weights, skeleton.jointMatrices);

  const { layout, vertices } = geometry;
  const floatsPerVertex = layout.stride / 4;
  const positionOffset = floatOffsetForSemantic(layout, 'position');
  const normalOffset = floatOffsetForSemantic(layout, 'normal');
  // Skinned from the BIND POSE every frame, never from the vertices written last frame — re-skinning an
  // already-skinned tangent would compound the pose instead of replacing it.
  const tangentOffset = bindPose.tangents.length > 0 ? floatOffsetForSemantic(layout, 'tangent') : -1;
  const { skinnedNormals, skinnedPositions, skinnedTangents } = bindPose;
  const vertexCount = (skinnedPositions.length / 3) | 0;

  for (let v = 0; v < vertexCount; v++) {
    const base = v * floatsPerVertex;
    const s = v * 3;
    if (positionOffset >= 0) {
      vertices[base + positionOffset] = skinnedPositions[s];
      vertices[base + positionOffset + 1] = skinnedPositions[s + 1];
      vertices[base + positionOffset + 2] = skinnedPositions[s + 2];
    }
    if (normalOffset >= 0) {
      vertices[base + normalOffset] = skinnedNormals[s];
      vertices[base + normalOffset + 1] = skinnedNormals[s + 1];
      vertices[base + normalOffset + 2] = skinnedNormals[s + 2];
    }
    if (tangentOffset >= 0) {
      // Four floats: the blended direction, then the handedness sign exactly as it was captured.
      const t = v * 4;
      vertices[base + tangentOffset] = skinnedTangents[t];
      vertices[base + tangentOffset + 1] = skinnedTangents[t + 1];
      vertices[base + tangentOffset + 2] = skinnedTangents[t + 2];
      vertices[base + tangentOffset + 3] = skinnedTangents[t + 3];
    }
  }

  geometry.version++;
}

// Refreshes only the deformable position/normal input of an existing skin bind pose from the
// geometry's current vertices. Static joints/weights and output scratch remain untouched. This is
// the allocation-free bridge for composed morph-then-skin deformation: morph writes its result into
// the geometry, this copies that result into skin input, then skinMeshGeometry applies the palette.
export function updateMeshSkinBindPoseDeformInput(bindPose: MeshSkinBindPose, geometry: Readonly<MeshGeometry>): void {
  const { layout, vertices } = geometry;
  const floatsPerVertex = layout.stride / 4;
  const vertexCount =
    floatsPerVertex > 0 ? Math.min((vertices.length / floatsPerVertex) | 0, bindPose.positions.length / 3) : 0;
  const positionOffset = floatOffsetForSemantic(layout, 'position');
  const normalOffset = floatOffsetForSemantic(layout, 'normal');

  for (let v = 0; v < vertexCount; v++) {
    const source = v * floatsPerVertex;
    const target = v * 3;
    if (positionOffset >= 0) {
      bindPose.positions[target] = vertices[source + positionOffset];
      bindPose.positions[target + 1] = vertices[source + positionOffset + 1];
      bindPose.positions[target + 2] = vertices[source + positionOffset + 2];
    }
    if (normalOffset >= 0) {
      bindPose.normals[target] = vertices[source + normalOffset];
      bindPose.normals[target + 1] = vertices[source + normalOffset + 1];
      bindPose.normals[target + 2] = vertices[source + normalOffset + 2];
    }
  }
}

// The float (not byte) offset of a semantic within an interleaved vertex record, or -1 when the
// layout does not carry it. byteOffset is a multiple of 4 for the float32 channels skinning reads.
function floatOffsetForSemantic(layout: Readonly<VertexAttributeLayout>, semantic: string): number {
  const attributes = layout.attributes;
  for (let i = 0; i < attributes.length; i++) {
    if (attributes[i].semantic === semantic) return attributes[i].byteOffset / 4;
  }
  return -1;
}
