import { createMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import type { MeshMorph, VertexAttributeLayout } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createMesh } from './mesh';
import { prepareScene3DMorph } from './prepareScene3DMorph';
import { createNode3D } from './sceneNode';

const POSITION_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

function morphedMesh(positions: readonly number[], deltas: readonly number[], weight: number) {
  const geometry = createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array(positions) });
  const mesh = createMesh(geometry, []);
  const morph: MeshMorph = {
    targets: [{ normalDeltas: null, positionDeltas: new Float32Array(deltas), tangentDeltas: null }],
    weights: new Float32Array([weight]),
  };
  mesh.morph = morph;
  return mesh;
}

describe('prepareScene3DMorph', () => {
  it('blends every morphed mesh in the subtree into its geometry', () => {
    const scene = createNode3D();
    const a = morphedMesh([0, 0, 0], [1, 0, 0], 1);
    const group = createNode3D();
    const b = morphedMesh([0, 0, 0], [0, 2, 0], 1);
    addNodeChild(group, b);
    addNodeChild(scene, a);
    addNodeChild(scene, group);

    prepareScene3DMorph(scene);

    expect(a.geometry.vertices[0]).toBe(1);
    expect(b.geometry.vertices[1]).toBe(2);
  });

  it('skips disabled subtrees', () => {
    const scene = createNode3D();
    const disabled = createNode3D(undefined, { enabled: false });
    const mesh = morphedMesh([0, 0, 0], [5, 0, 0], 1);
    addNodeChild(disabled, mesh);
    addNodeChild(scene, disabled);

    prepareScene3DMorph(scene);

    // Untouched: the disabled subtree is never walked.
    expect(mesh.geometry.vertices[0]).toBe(0);
  });

  it('is a no-op for a scene with no morphed meshes', () => {
    const scene = createNode3D();
    const rigid = createMesh(
      createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array([3, 3, 3]) }),
      [],
    );
    addNodeChild(scene, rigid);
    const version = rigid.geometry.version;

    prepareScene3DMorph(scene);

    expect(rigid.geometry.version).toBe(version);
  });
});
