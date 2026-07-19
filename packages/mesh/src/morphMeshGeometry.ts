import type { MeshGeometry, MeshMorph, MeshMorphBindPose } from '@flighthq/types';

import { getVertexAttributeFloatOffset } from './meshGeometryAttributes';

// Blends a morphed MeshGeometry in place for the current weights: computes base + Σ wᵢ·targetᵢ
// (an additive blend) for position, and — where the base carries them — normal and tangent, into the
// base pose's scratch, then writes the blended attributes back into the interleaved `geometry.vertices`
// and bumps `geometry.version` so the backends re-upload. `bindPose` is the capture the caller holds on
// the geometry runtime; only the position/normal/tangent-xyz channels are rewritten, so uv0/color0/the
// tangent handedness `w` stay intact. A target whose normal/tangent deltas are null contributes only to
// position. A zero (or unset) weight contributes nothing, so a settled morph is base-cost. Scene-free by
// design — the mesh-level glue that owns the runtime slot lives in @flighthq/scene (updateMeshMorph).
// Sibling of skinMeshGeometry; the two compose (skin over morph) when a mesh carries both.
export function blendMeshGeometryMorph(
  geometry: MeshGeometry,
  morph: Readonly<MeshMorph>,
  bindPose: Readonly<MeshMorphBindPose>,
): void {
  const { blendedNormals, blendedPositions, blendedTangents, normals, positions, tangents } = bindPose;
  const vertexCount = (positions.length / 3) | 0;
  const floats = vertexCount * 3;

  blendedPositions.set(positions.subarray(0, floats));
  if (blendedNormals !== null && normals !== null) blendedNormals.set(normals.subarray(0, floats));
  if (blendedTangents !== null && tangents !== null) blendedTangents.set(tangents.subarray(0, floats));

  const targets = morph.targets;
  const weights = morph.weights;
  const targetCount = Math.min(targets.length, weights.length);
  for (let t = 0; t < targetCount; t++) {
    const weight = weights[t];
    if (weight === 0) continue;
    const target = targets[t];
    accumulateDeltas(blendedPositions, target.positionDeltas, weight, floats);
    if (blendedNormals !== null && target.normalDeltas !== null) {
      accumulateDeltas(blendedNormals, target.normalDeltas, weight, floats);
    }
    if (blendedTangents !== null && target.tangentDeltas !== null) {
      accumulateDeltas(blendedTangents, target.tangentDeltas, weight, floats);
    }
  }

  const { layout, vertices } = geometry;
  const floatsPerVertex = layout.stride / 4;
  const positionOffset = getVertexAttributeFloatOffset(layout, 'position');
  const normalOffset = getVertexAttributeFloatOffset(layout, 'normal');
  const tangentOffset = getVertexAttributeFloatOffset(layout, 'tangent');

  for (let v = 0; v < vertexCount; v++) {
    const dst = v * floatsPerVertex;
    const s = v * 3;
    if (positionOffset >= 0) {
      vertices[dst + positionOffset] = blendedPositions[s];
      vertices[dst + positionOffset + 1] = blendedPositions[s + 1];
      vertices[dst + positionOffset + 2] = blendedPositions[s + 2];
    }
    if (blendedNormals !== null && normalOffset >= 0) {
      vertices[dst + normalOffset] = blendedNormals[s];
      vertices[dst + normalOffset + 1] = blendedNormals[s + 1];
      vertices[dst + normalOffset + 2] = blendedNormals[s + 2];
    }
    if (blendedTangents !== null && tangentOffset >= 0) {
      vertices[dst + tangentOffset] = blendedTangents[s];
      vertices[dst + tangentOffset + 1] = blendedTangents[s + 1];
      vertices[dst + tangentOffset + 2] = blendedTangents[s + 2];
    }
  }

  geometry.version++;
}

// Captures the de-interleaved CPU-morph base pose for one MeshGeometry: the base (rest)
// position/normal/tangent attributes read out of the interleaved `geometry.vertices` through
// `geometry.layout`, plus reusable blended-output scratch. Allocates the SoA arrays once; the
// per-frame blend (blendMeshGeometryMorph) then allocates nothing. Call once, before the first blend,
// and store the result on the geometry's runtime (MeshGeometryRuntime.morphBindPose). Normal/tangent
// arrays are null when the base layout omits that channel, so the blend rewrites only the channels the
// geometry carries. The tangent is captured as its xyz direction (3 floats); the handedness `w` stays
// in geometry.vertices and is not morphed. Sibling of captureMeshSkinBindPose.
export function captureMeshMorphBindPose(geometry: Readonly<MeshGeometry>): MeshMorphBindPose {
  const { layout, vertices } = geometry;
  const floatsPerVertex = layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? (vertices.length / floatsPerVertex) | 0 : 0;

  const positionOffset = getVertexAttributeFloatOffset(layout, 'position');
  const normalOffset = getVertexAttributeFloatOffset(layout, 'normal');
  const tangentOffset = getVertexAttributeFloatOffset(layout, 'tangent');

  const positions = new Float32Array(vertexCount * 3);
  const normals = normalOffset >= 0 ? new Float32Array(vertexCount * 3) : null;
  const tangents = tangentOffset >= 0 ? new Float32Array(vertexCount * 3) : null;

  for (let v = 0; v < vertexCount; v++) {
    const base = v * floatsPerVertex;
    const p = v * 3;
    if (positionOffset >= 0) {
      positions[p] = vertices[base + positionOffset];
      positions[p + 1] = vertices[base + positionOffset + 1];
      positions[p + 2] = vertices[base + positionOffset + 2];
    }
    if (normals !== null) {
      normals[p] = vertices[base + normalOffset];
      normals[p + 1] = vertices[base + normalOffset + 1];
      normals[p + 2] = vertices[base + normalOffset + 2];
    }
    if (tangents !== null) {
      tangents[p] = vertices[base + tangentOffset];
      tangents[p + 1] = vertices[base + tangentOffset + 1];
      tangents[p + 2] = vertices[base + tangentOffset + 2];
    }
  }

  return {
    blendedNormals: normals !== null ? new Float32Array(vertexCount * 3) : null,
    blendedPositions: new Float32Array(vertexCount * 3),
    blendedTangents: tangents !== null ? new Float32Array(vertexCount * 3) : null,
    normals,
    positions,
    tangents,
  };
}

// Adds `weight * deltas[i]` into `accumulator[i]` for the first `count` floats. `deltas` shorter than
// `count` contributes only over its own length (a sparse target padded to fewer floats), leaving the
// rest of the accumulator at its base value.
function accumulateDeltas(
  accumulator: Float32Array,
  deltas: Readonly<Float32Array>,
  weight: number,
  count: number,
): void {
  const n = Math.min(count, deltas.length);
  for (let i = 0; i < n; i++) accumulator[i] += weight * deltas[i];
}
