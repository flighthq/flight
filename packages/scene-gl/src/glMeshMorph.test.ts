import { createMeshGeometry } from '@flighthq/mesh';
import { createMesh, updateMeshMorph } from '@flighthq/scene';
import type { MeshMorph, VertexAttributeLayout } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { ensureGlMeshUpload } from './glMeshUpload';
import { makeGlSceneState } from './glSceneTestHelper';

// The GL vertex morph path is CPU-blend-then-upload: updateMeshMorph blends base + Σ wᵢ·targetᵢ into
// geometry.vertices and bumps the version, and ensureGlMeshUpload (the non-skinned path) re-uploads the
// deformed vertices. These tests exercise that seam end to end on the GL backend so a morphed mesh
// renders its blended shape without a HAS_MORPH shader permutation.

const POSITION_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

function lastUploadedVertices(calls: readonly { name: string; args: readonly unknown[] }[]): Float32Array {
  const data = calls
    .filter((c) => c.name === 'bufferData')
    .map((c) => c.args[1])
    .filter((d): d is Float32Array => d instanceof Float32Array);
  return data[data.length - 1]!;
}

describe('glMeshMorph', () => {
  it('uploads the morph-blended vertices for a morphed mesh (CPU-blend-then-upload GL path)', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array([0, 0, 0, 1, 0, 0]) });
    const morph: MeshMorph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([0, 5, 0, 0, 5, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    const mesh = createMesh(geometry, []);
    mesh.morph = morph;

    // First upload before morph blends.
    ensureGlMeshUpload(state, geometry, false);

    // Blend the morph (weight 1 raises both vertices by 5 in y) and re-upload.
    updateMeshMorph(mesh);
    ensureGlMeshUpload(state, geometry, false);

    const uploaded = lastUploadedVertices(gl.calls);
    expect(Array.from(uploaded)).toEqual([0, 5, 0, 1, 5, 0]);
  });

  it('re-uploads as the morph weights change frame to frame', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array([0, 0, 0]) });
    const morph: MeshMorph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([2, 0, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    const mesh = createMesh(geometry, []);
    mesh.morph = morph;

    updateMeshMorph(mesh);
    ensureGlMeshUpload(state, geometry, false);
    expect(Array.from(lastUploadedVertices(gl.calls))).toEqual([2, 0, 0]);

    morph.weights[0] = 0.5;
    updateMeshMorph(mesh);
    ensureGlMeshUpload(state, geometry, false);
    expect(Array.from(lastUploadedVertices(gl.calls))).toEqual([1, 0, 0]);
  });
});
