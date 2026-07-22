import { createMeshGeometry, getMeshGeometryMorphBindPose } from '@flighthq/mesh';
import type { MeshMorph, VertexAttributeLayout } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMesh } from './mesh';
import { updateMeshMorph } from './updateMeshMorph';

const POSITION_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

function morphedMesh(positions: readonly number[], morph: MeshMorph) {
  const geometry = createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array(positions) });
  const mesh = createMesh(geometry, []);
  mesh.morph = morph;
  return mesh;
}

describe('updateMeshMorph', () => {
  it('captures the base pose lazily and blends the geometry for the weights', () => {
    const morph: MeshMorph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([0, 10, 0]), tangentDeltas: null }],
      weights: new Float32Array([0.5]),
    };
    const mesh = morphedMesh([1, 2, 3], morph);

    expect(getMeshGeometryMorphBindPose(mesh.geometry)).toBeNull();
    updateMeshMorph(mesh);

    expect(getMeshGeometryMorphBindPose(mesh.geometry)).not.toBeNull();
    expect(Array.from(mesh.geometry.vertices)).toEqual([1, 7, 3]);
    expect(mesh.geometry.bounds?.min.y).toBe(7);
    expect(mesh.geometry.bounds?.max.y).toBe(7);
  });

  it('reblends from the captured base each frame as weights change', () => {
    const morph: MeshMorph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([2, 0, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    const mesh = morphedMesh([0, 0, 0], morph);

    updateMeshMorph(mesh);
    expect(Array.from(mesh.geometry.vertices)).toEqual([2, 0, 0]);

    morph.weights[0] = 3;
    updateMeshMorph(mesh);
    expect(Array.from(mesh.geometry.vertices)).toEqual([6, 0, 0]);
    expect(mesh.geometry.bounds?.min.x).toBe(6);
  });

  it('is a no-op for a mesh with no morph', () => {
    const geometry = createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array([5, 5, 5]) });
    const mesh = createMesh(geometry, []);
    const version = geometry.version;
    updateMeshMorph(mesh);
    expect(geometry.version).toBe(version);
    expect(Array.from(geometry.vertices)).toEqual([5, 5, 5]);
  });
});
